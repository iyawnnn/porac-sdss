import express from 'express';
import request from 'supertest';
import { trustProxyHops } from './client-ip';

// supertest connects over loopback, standing in for the Next rewrite hop.
function appWithHops(hops: number) {
  const app = express();
  app.set('trust proxy', trustProxyHops(hops));
  app.get('/', (req, res) => {
    res.send(req.ip);
  });
  return app;
}

describe('trustProxyHops', () => {
  it('ignores a forged X-Forwarded-For when no edge proxy is configured', async () => {
    const res = await request(appWithHops(0))
      .get('/')
      .set('X-Forwarded-For', '6.6.6.6');
    expect(res.text).not.toBe('6.6.6.6');
    expect(res.text).toMatch(/127\.0\.0\.1|::1/);
  });

  it('takes the address an edge proxy appended, not the client-supplied prefix', async () => {
    const res = await request(appWithHops(1))
      .get('/')
      .set('X-Forwarded-For', '6.6.6.6, 203.0.113.7');
    expect(res.text).toBe('203.0.113.7');
  });

  it('walks back through multiple configured edge hops', async () => {
    const res = await request(appWithHops(2))
      .get('/')
      .set('X-Forwarded-For', '6.6.6.6, 203.0.113.7, 10.0.0.2');
    expect(res.text).toBe('203.0.113.7');
  });

  it('never trusts a non-loopback socket peer, so direct callers cannot forge', () => {
    const trust = trustProxyHops(1);
    expect(trust('203.0.113.9', 0)).toBe(false);
    expect(trust('127.0.0.1', 0)).toBe(true);
    expect(trust('::ffff:127.0.0.1', 0)).toBe(true);
    expect(trust('::1', 0)).toBe(true);
  });
});
