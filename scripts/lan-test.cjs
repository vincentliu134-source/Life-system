// One server and one isolated data directory for desktop/mobile testing.
const { spawn } = require('node:child_process');
const { networkInterfaces, hostname } = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const root = path.resolve(__dirname, '..');
const addresses = Object.entries(networkInterfaces()).flatMap(([name, list]) =>
  (list || []).filter(i => i.family === 'IPv4' && !i.internal &&
    /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(i.address))
    .map(i => ({ name, address: i.address })));
const host = process.env.LIFE_TEST_HOST || addresses.find(i => i.name === 'en0')?.address || addresses[0]?.address;
if (!host || !addresses.some(i => i.address === host)) {
  console.error('请先连接局域网；LIFE_TEST_HOST 必须是本机的局域网地址。');
  process.exit(1);
}
const port = process.env.LIFE_TEST_PORT || '3040';
if (!/^\d+$/.test(port) || +port < 1024 || +port > 65535) throw new Error('测试端口无效');
const data = path.join(root, 'data', 'lan-test');
const localName = (hostname().includes('.') ? hostname() : `${hostname()}.local`).toLowerCase();
fs.mkdirSync(data, { recursive: true });
console.log(`优先打开：http://${localName}:${port}\n局域网 IP 备用地址：http://${host}:${port}\n本机备用地址：http://127.0.0.1:${port}\n独立测试数据：${data}\n退出请按 Ctrl+C。仅用于可信局域网，不向公网开放。`);
const child = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'dev', '--hostname', '0.0.0.0', '--port', port], {
  cwd: root, stdio: 'inherit', env: { ...process.env, LIFE_DATA_DIR: data, LIFE_TEST_MODE: '1', LIFE_TEST_ORIGIN: localName, LIFE_TEST_IP: host },
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code || 0; });
