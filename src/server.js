import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';
import { ROOT_DIR, env } from './config.js';
import * as engine from './engine.js';

const PORT = env.PORT;
const INDEX_HTML = path.join(ROOT_DIR, 'public', 'index.html');
const TEST_HTML = path.join(ROOT_DIR, 'public', 'test.html');

function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  try {
    if (req.method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
      // 파일을 먼저 읽는다 — 없을 때 헤더 전송 전에 실패해야 catch가 에러를 응답할 수 있다
      const html = fs.readFileSync(INDEX_HTML);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }
    if (req.method === 'GET' && pathname === '/test') {
      const html = fs.readFileSync(TEST_HTML);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }
    if (req.method === 'GET' && pathname === '/api/state') {
      return json(res, 200, engine.getState());
    }
    if (req.method === 'POST' && pathname === '/api/refresh') {
      engine.sync(); // 오래 걸리므로 백그라운드로 (진행 상태는 /api/state의 syncing)
      return json(res, 200, { ok: true });
    }
    if (req.method === 'POST' && pathname === '/api/mode') {
      const { meeting, mode } = await readBody(req);
      engine.setMode(meeting, mode);
      return json(res, 200, { ok: true });
    }
    if (req.method === 'POST' && pathname === '/api/skip') {
      const { meeting, skipped } = await readBody(req);
      engine.toggleSkip(meeting, skipped);
      return json(res, 200, { ok: true });
    }
    if (req.method === 'POST' && pathname === '/api/settings') {
      const { leadSeconds } = await readBody(req);
      engine.setLeadSeconds(leadSeconds);
      return json(res, 200, { ok: true });
    }
    if (req.method === 'POST' && pathname === '/api/pause') {
      const { range } = await readBody(req);
      engine.setPause(range);
      return json(res, 200, { ok: true });
    }
    if (req.method === 'POST' && pathname === '/api/rules/remove') {
      const { type, key } = await readBody(req);
      engine.removeRule(type, key);
      return json(res, 200, { ok: true });
    }
    if (req.method === 'POST' && pathname === '/api/add') {
      const body = await readBody(req);
      engine.addOnce(body);
      return json(res, 200, { ok: true });
    }
    if (req.method === 'POST' && pathname === '/api/join') {
      const { meeting } = await readBody(req);
      engine.joinNow(meeting).catch((e) => console.error('접속 실패:', e.message));
      return json(res, 200, { ok: true });
    }
    json(res, 404, { error: 'not found' });
  } catch (err) {
    json(res, 400, { error: err.message });
  }
});

export function startServer() {
  engine.startEngine();
  server.listen(PORT, '127.0.0.1', () => {
    const url = `http://localhost:${PORT}`;
    console.log(`관리 페이지: ${url}`);
    if (process.platform === 'darwin' && !process.env.NO_OPEN) exec(`open ${url}`);
  });
}
