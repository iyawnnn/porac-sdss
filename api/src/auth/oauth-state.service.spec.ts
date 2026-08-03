import { ConfigService } from '@nestjs/config';
import { SignJWT } from 'jose';
import { OAuthStateService } from './oauth-state.service';
import type { Env } from '../config/env';

function makeService(): OAuthStateService {
  const config = {
    get: (key: string) =>
      key === 'OAUTH_STATE_SECRET'
        ? 'a-test-oauth-state-secret-at-least-32-bytes'
        : undefined,
  } as unknown as ConfigService<Env, true>;
  return new OAuthStateService(config);
}

describe('OAuthStateService', () => {
  it('accepts a valid, matching state/cookie pair exactly once', async () => {
    const service = makeService();
    const { token, nonce } = await service.issue('google');
    await expect(service.consume('google', token, nonce)).resolves.toEqual({
      purpose: 'login',
      citizenId: undefined,
    });
  });

  it('binds a link/reauth state to the issuing citizenId and returns it on consume', async () => {
    const service = makeService();
    const { token, nonce } = await service.issue('google', 'link', 42);
    await expect(service.consume('google', token, nonce)).resolves.toEqual({
      purpose: 'link',
      citizenId: 42,
    });
  });

  it('rejects a link/reauth state issued without a citizenId', async () => {
    const service = makeService();
    const secret = new TextEncoder().encode(
      'a-test-oauth-state-secret-at-least-32-bytes',
    );
    const noCitizen = await new SignJWT({
      nonce: 'n2',
      provider: 'google',
      purpose: 'link',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setAudience('oauth-state')
      .setExpirationTime('10m')
      .sign(secret);
    await expect(service.consume('google', noCitizen, 'n2')).rejects.toThrow(
      'missing citizenId',
    );
  });

  it('rejects a tampered state token', async () => {
    const service = makeService();
    const { token, nonce } = await service.issue('google');
    const tampered = token.slice(0, -1) + (token.at(-1) === 'a' ? 'b' : 'a');
    await expect(service.consume('google', tampered, nonce)).rejects.toThrow();
  });

  it('rejects when the cookie nonce does not match the state token', async () => {
    const service = makeService();
    const { token } = await service.issue('google');
    await expect(
      service.consume('google', token, 'a-different-nonce'),
    ).rejects.toThrow();
  });

  it('rejects a missing cookie nonce', async () => {
    const service = makeService();
    const { token } = await service.issue('google');
    await expect(service.consume('google', token, undefined)).rejects.toThrow();
  });

  it('rejects a provider mismatch between issue and consume', async () => {
    const service = makeService();
    const { token, nonce } = await service.issue('google');
    await expect(service.consume('facebook', token, nonce)).rejects.toThrow();
  });

  it('rejects an expired state token', async () => {
    const service = makeService();
    const secret = new TextEncoder().encode(
      'a-test-oauth-state-secret-at-least-32-bytes',
    );
    const expired = await new SignJWT({ nonce: 'n1', provider: 'google' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 1000)
      .setAudience('oauth-state')
      .setExpirationTime(Math.floor(Date.now() / 1000) - 1)
      .sign(secret);
    await expect(service.consume('google', expired, 'n1')).rejects.toThrow();
  });

  it('rejects state replay — the same token cannot be consumed twice', async () => {
    const service = makeService();
    const { token, nonce } = await service.issue('google');
    await service.consume('google', token, nonce);
    await expect(service.consume('google', token, nonce)).rejects.toThrow(
      'OAuth state already used',
    );
  });
});
