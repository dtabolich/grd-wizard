require('dotenv').config();
const express = require('express');
const { exec } = require('child_process');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');

const app = express();

// Configure multer to preserve original filenames
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    // Use original filename
    cb(null, file.originalname);
  }
});
const upload = multer({ storage: storage });

// Configuration - adjust this path based on your system
const LICENSE_WIZARD_PATH = process.env.LICENSE_WIZARD_PATH ||
  (os.platform() === 'win32'
    ? 'C:\\Program Files (x86)\\Guardant\\Software Licensing Kit\\redistribute\\license_activation\\license_wizard.exe'
    : '/opt/guardant/license_wizard');

app.use(express.json());
app.use(express.static('public'));

/**
 * Execute License Wizard command and return result
 */
function runCommand(args) {
  return new Promise((resolve, reject) => {
    const cmdLine = `"${LICENSE_WIZARD_PATH}" --console ${args.join(' ')}`;

    console.log('\n=== Executing License Wizard Command ===');
    console.log('Command:', cmdLine);
    console.log('Arguments:', args);
    console.log('========================================\n');

    exec(cmdLine, {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
      timeout: 30000
    }, (error, stdout, stderr) => {
      console.log('=== Command Completed ===');
      console.log('Exit Code:', error ? error.code : 0);
      console.log('Success:', !error || error.code === 0);
      if (stdout) console.log('Stdout:', stdout);
      if (stderr) console.log('Stderr:', stderr);
      console.log('=========================\n');

      if (error && error.killed) {
        reject({ status: 408, message: 'Command timeout' });
        return;
      }

      resolve({
        success: !error || error.code === 0,
        returncode: error ? error.code : 0,
        stdout: stdout || '',
        stderr: stderr || ''
      });
    });
  });
}

/**
 * Root endpoint
 */
app.get('/', (req, res) => {
  res.json({
    message: 'Guardant License Wizard API',
    version: '1.0.0',
    docs: '/api-docs'
  });
});

/**
 * List all existing licenses
 */
app.get('/licenses', async (req, res) => {
  try {
    const result = await runCommand(['--list']);
    res.json(result);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

/**
 * Generate an initial license activation request
 */
app.post('/licenses/activate-request/:licenseId', async (req, res) => {
  try {
    const { licenseId } = req.params;
    const { host } = req.body;

    // Generate request file path
    const requestFileName = `${licenseId}_activation.request`;
    const requestFilePath = path.resolve(os.tmpdir(), requestFileName);

    const args = ['--activate-request', licenseId, requestFilePath];
    if (host) {
      args.push('--host', host);
    }

    const result = await runCommand(args);

    // Add request file path to response
    res.json({
      ...result,
      requestFilePath: requestFilePath,
      requestFileName: requestFileName
    });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

/**
 * Activate license online
 */
app.post('/licenses/activate', async (req, res) => {
  try {
    const { serial_number, host } = req.body;

    if (!serial_number) {
      return res.status(400).json({ error: 'serial_number is required' });
    }

    const args = ['--activate', serial_number];
    if (host) {
      args.push('--host', host);
    }

    const result = await runCommand(args);
    res.json(result);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

/**
 * Activate license offline using uploaded license file
 */
app.post('/licenses/activate-offline', upload.single('license_file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'license_file is required' });
    }

    const result = await runCommand(['--activate-offline', req.file.path]);

    // Cleanup uploaded file
    await fs.unlink(req.file.path).catch(() => {});

    res.json(result);
  } catch (error) {
    if (req.file) {
      await fs.unlink(req.file.path).catch(() => {});
    }
    res.status(error.status || 500).json({ error: error.message });
  }
});

/**
 * Process and submit activation response
 */
app.post('/licenses/activate-response', upload.single('request_file'), async (req, res) => {
  try {
    const { serial_number } = req.body;

    if (!serial_number || !req.file) {
      return res.status(400).json({
        error: 'serial_number and request_file are required'
      });
    }

    // Get absolute paths
    const requestFilePath = path.resolve(req.file.path);
    const originalName = req.file.originalname;

    // Generate license file path by replacing .request with .license
    const licenseFileName = originalName.replace(/\.request$/i, '.license');
    const licenseFilePath = path.resolve(path.join(path.dirname(requestFilePath), licenseFileName));

    const args = [
      '--activate-response',
      serial_number,
      requestFilePath,
      licenseFilePath
    ];

    // Add host parameter from env if configured
    if (process.env.HOST) {
      args.push('--host', process.env.HOST);
    }

    const result = await runCommand(args);

    // Cleanup uploaded file
    await fs.unlink(requestFilePath).catch(() => {});

    // Add license file path to response
    res.json({
      ...result,
      licenseFilePath: licenseFilePath,
      licenseFileName: licenseFileName
    });
  } catch (error) {
    if (req.file) {
      await fs.unlink(req.file.path).catch(() => {});
    }
    res.status(error.status || 500).json({ error: error.message });
  }
});

/**
 * Generate a license update request
 */
app.post('/licenses/:licenseId/update-request', async (req, res) => {
  try {
    const { licenseId } = req.params;
    const tempFilePath = path.join(os.tmpdir(), `update_request_${Date.now()}.req`);

    const result = await runCommand([
      '--update-request',
      licenseId,
      tempFilePath
    ]);

    if (result.success) {
      try {
        await fs.access(tempFilePath);
        res.download(tempFilePath, `update_request_${licenseId}.req`, async (err) => {
          await fs.unlink(tempFilePath).catch(() => {});
        });
      } catch {
        res.json(result);
      }
    } else {
      await fs.unlink(tempFilePath).catch(() => {});
      res.json(result);
    }
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

/**
 * Process and submit update response
 */
app.post('/licenses/update-response', upload.single('license_file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'license_file is required' });
    }

    const result = await runCommand(['--update-response', req.file.path]);

    // Cleanup uploaded file
    await fs.unlink(req.file.path).catch(() => {});

    res.json(result);
  } catch (error) {
    if (req.file) {
      await fs.unlink(req.file.path).catch(() => {});
    }
    res.status(error.status || 500).json({ error: error.message });
  }
});

/**
 * Update license online
 */
app.post('/licenses/:licenseId/update', async (req, res) => {
  try {
    const { licenseId } = req.params;
    const { host } = req.body;

    const args = ['--update', licenseId];
    if (host) {
      args.push('--host', host);
    }

    const result = await runCommand(args);
    res.json(result);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

/**
 * Generate a license return request
 */
app.post('/licenses/:licenseId/return-request', async (req, res) => {
  try {
    const { licenseId } = req.params;
    const tempFilePath = path.join(os.tmpdir(), `return_request_${Date.now()}.req`);

    const result = await runCommand([
      '--return-request',
      licenseId,
      tempFilePath
    ]);

    if (result.success) {
      try {
        await fs.access(tempFilePath);
        res.download(tempFilePath, `return_request_${licenseId}.req`, async (err) => {
          await fs.unlink(tempFilePath).catch(() => {});
        });
      } catch {
        res.json(result);
      }
    } else {
      await fs.unlink(tempFilePath).catch(() => {});
      res.json(result);
    }
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

/**
 * Process and submit return response
 */
app.post('/licenses/return-response', upload.single('license_file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'license_file is required' });
    }

    const result = await runCommand(['--return-response', req.file.path]);

    // Cleanup uploaded file
    await fs.unlink(req.file.path).catch(() => {});

    res.json(result);
  } catch (error) {
    if (req.file) {
      await fs.unlink(req.file.path).catch(() => {});
    }
    res.status(error.status || 500).json({ error: error.message });
  }
});

/**
 * Return license online
 */
app.post('/licenses/:licenseId/return', async (req, res) => {
  try {
    const { licenseId } = req.params;
    const { host } = req.body;

    const args = ['--return', licenseId];
    if (host) {
      args.push('--host', host);
    }

    const result = await runCommand(args);
    res.json(result);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

/**
 * Delete a license
 */
app.delete('/licenses/:licenseId', async (req, res) => {
  try {
    const { licenseId } = req.params;
    const result = await runCommand(['--delete', licenseId]);
    res.json(result);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Guardant License Wizard API running on port ${PORT}`);
  console.log(`License Wizard Path: ${LICENSE_WIZARD_PATH}`);
});