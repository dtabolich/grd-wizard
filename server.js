const express = require('express');
const { exec } = require('child_process');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');

const app = express();
const upload = multer({ dest: 'uploads/' });

// Configuration - adjust this path based on your system
const LICENSE_WIZARD_PATH = process.env.LICENSE_WIZARD_PATH ||
  (os.platform() === 'win32'
    ? 'C:\\Program Files (x86)\\Guardant\\Software Licensing Kit\\redistribute\\license_activation\\license_wizard.exe'
    : '/opt/guardant/license_wizard');

app.use(express.json());

/**
 * Execute License Wizard command and return result
 */
function runCommand(args) {
  return new Promise((resolve, reject) => {
    const cmd = `"${LICENSE_WIZARD_PATH}" --console ${args.join(' ')}`;

    exec(cmd, { timeout: 30000 }, (error, stdout, stderr) => {
      if (error && error.killed) {
        reject({ status: 408, message: 'Command timeout' });
        return;
      }

      resolve({
        success: !error || error.code === 0,
        returncode: error ? error.code : 0,
        stdout: stdout,
        stderr: stderr
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
    const result = await runCommand(['--activate-request', licenseId]);
    res.json(result);
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
app.post('/licenses/activate-response', upload.fields([
  { name: 'request_file', maxCount: 1 },
  { name: 'license_file', maxCount: 1 }
]), async (req, res) => {
  try {
    const { serial_number } = req.body;

    if (!serial_number || !req.files['request_file'] || !req.files['license_file']) {
      return res.status(400).json({
        error: 'serial_number, request_file, and license_file are required'
      });
    }

    const requestFilePath = req.files['request_file'][0].path;
    const licenseFilePath = req.files['license_file'][0].path;

    const result = await runCommand([
      '--activate-response',
      serial_number,
      requestFilePath,
      licenseFilePath
    ]);

    // Cleanup uploaded files
    await fs.unlink(requestFilePath).catch(() => {});
    await fs.unlink(licenseFilePath).catch(() => {});

    res.json(result);
  } catch (error) {
    if (req.files) {
      if (req.files['request_file']) {
        await fs.unlink(req.files['request_file'][0].path).catch(() => {});
      }
      if (req.files['license_file']) {
        await fs.unlink(req.files['license_file'][0].path).catch(() => {});
      }
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