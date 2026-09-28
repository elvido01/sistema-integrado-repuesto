import { describe, it, expect, vi } from 'vitest';
import { SOCIAL_SCOPES, providerConfig, authorizationUrl, sha256, randomSecret, checkTokens, exchangeCode, readIdentity } from '../supabase/functions/_shared/social-oauth.mjs';

const cfg = (platform) => ({ platform, clientId: 'CLIENT', clientSecret: 'SECRET', redirectUri: `https://app.example/callback/${platform}` });
const tokens = (platform) => ({ access_token: 'ACCESS', refresh_token: 'REFRESH', expires_in: 3600, scope: SOCIAL_SCOPES[platform].join(','), open_id: 'TK1' });
const response = (body, status = 200) => ({ ok: status === 200, status, json: async () => body });

describe('Social OAuth', () => {
  it('rejects unsupported providers and missing server credentials', () => {
    expect(() => providerConfig('evil', () => 'x')).toThrow();
    expect(() => providerConfig('youtube', () => undefined)).toThrow();
  });
  it.each(['youtube', 'tiktok'])('builds %s consent without exposing the secret', (platform) => {
    const url = new URL(authorizationUrl(cfg(platform), 'STATE', 'CHALLENGE'));
    expect(url.toString()).not.toContain('SECRET');
    expect(url.searchParams.get('state')).toBe('STATE');
    expect(url.searchParams.get('redirect_uri')).toBe(cfg(platform).redirectUri);
    if (platform === 'youtube') {
      expect(url.searchParams.get('code_challenge_method')).toBe('S256');
      expect(url.searchParams.get('access_type')).toBe('offline');
    } else expect(url.searchParams.get('scope')).toBe('user.info.basic,video.publish');
  });
  it('generates unguessable state and a stable PKCE digest', async () => {
    expect(randomSecret()).toMatch(/^[a-f0-9]{64}$/);
    expect(randomSecret()).not.toBe(randomSecret());
    expect(await sha256('abc')).toBe('ungWv48Bz-pBQUDeXa4iI7ADYaOWF3qctBD_YfIAFa0');
  });
  it.each(['youtube', 'tiktok'])('rejects missing scopes, refresh token, and bad %s expiry', (p) => {
    expect(checkTokens(p, tokens(p)).access_token).toBe('ACCESS');
    expect(() => checkTokens(p, { ...tokens(p), scope: '' })).toThrow();
    expect(() => checkTokens(p, { ...tokens(p), refresh_token: '' })).toThrow();
    expect(() => checkTokens(p, { ...tokens(p), expires_in: -1 })).toThrow();
  });
  it('exchanges code using a body, not URL credentials', async () => {
    const f = vi.fn(async () => response(tokens('youtube')));
    await exchangeCode(cfg('youtube'), 'CODE', 'VERIFIER', f);
    const [url, opts] = f.mock.calls[0];
    expect(url).toBe('https://oauth2.googleapis.com/token');
    expect(opts.body.get('client_secret')).toBe('SECRET');
    expect(opts.body.get('code_verifier')).toBe('VERIFIER');
    expect(opts.redirect).toBe('error');
  });
  it('does not expose sensitive provider errors', async () => {
    await expect(exchangeCode(cfg('youtube'), 'CODE', 'V', async () => response({ error: 'SECRET' }, 400))).rejects.not.toThrow('SECRET');
  });
  it('checks TikTok identity against the token subject', async () => {
    await expect(readIdentity('tiktok', tokens('tiktok'), async () => response({ error: { code: 'ok' }, data: { user: { open_id: 'OTHER' } } }))).rejects.toThrow();
  });
  it('does not guess between YouTube channels', async () => {
    await expect(readIdentity('youtube', tokens('youtube'), async () => response({ items: [{ id: 'A' }, { id: 'B' }] }))).rejects.toThrow();
    expect(await readIdentity('youtube', tokens('youtube'), async () => response({ items: [{ id: 'A', snippet: { title: 'Morla' } }] }))).toEqual({ id: 'A', name: 'Morla' });
  });
});
