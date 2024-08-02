import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import * as cheerio from 'cheerio';
import testAdapter from './test-adapter.js';
import { loadFixture } from './test-utils.js';
import * as devalue from 'devalue';

describe('Astro Actions', () => {
	let fixture;
	before(async () => {
		fixture = await loadFixture({
			root: './fixtures/actions/',
			adapter: testAdapter(),
		});
	});

	describe('dev', () => {
		let devServer;

		before(async () => {
			devServer = await fixture.startDevServer();
		});

		after(async () => {
			await devServer.stop();
		});

		it('Exposes subscribe action', async () => {
			const res = await fixture.fetch('/_actions/subscribe', {
				method: 'POST',
				body: JSON.stringify({ channel: 'bholmesdev' }),
				headers: {
					'Content-Type': 'application/json',
				},
			});

			assert.equal(res.ok, true);
			assert.equal(res.headers.get('Content-Type'), 'application/json+devalue');

			const data = devalue.parse(await res.text());
			assert.equal(data.channel, 'bholmesdev');
			assert.equal(data.subscribeButtonState, 'smashed');
		});

		it('Exposes comment action', async () => {
			const formData = new FormData();
			formData.append('channel', 'bholmesdev');
			formData.append('comment', 'Hello, World!');
			const res = await fixture.fetch('/_actions/comment', {
				method: 'POST',
				body: formData,
			});

			assert.equal(res.ok, true);
			assert.equal(res.headers.get('Content-Type'), 'application/json+devalue');

			const data = devalue.parse(await res.text());
			assert.equal(data.channel, 'bholmesdev');
			assert.equal(data.comment, 'Hello, World!');
		});

		it('Raises validation error on bad form data', async () => {
			const formData = new FormData();
			formData.append('channel', 'bholmesdev');
			const res = await fixture.fetch('/_actions/comment', {
				method: 'POST',
				body: formData,
			});

			assert.equal(res.ok, false);
			assert.equal(res.status, 400);
			assert.equal(res.headers.get('Content-Type'), 'application/json');

			const data = await res.json();
			assert.equal(data.type, 'AstroActionInputError');
		});

		it('Exposes plain formData action', async () => {
			const formData = new FormData();
			formData.append('channel', 'bholmesdev');
			formData.append('comment', 'Hello, World!');
			const res = await fixture.fetch('/_actions/commentPlainFormData', {
				method: 'POST',
				body: formData,
			});

			assert.equal(res.ok, true);
			assert.equal(res.headers.get('Content-Type'), 'application/json+devalue');

			const data = devalue.parse(await res.text());
			assert.equal(data.success, true);
			assert.equal(data.isFormData, true, 'Should receive plain FormData');
		});
	});

	describe('build', () => {
		let app;

		before(async () => {
			await fixture.build();
			app = await fixture.loadTestAdapterApp();
		});

		it('Exposes subscribe action', async () => {
			const req = new Request('http://example.com/_actions/subscribe', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ channel: 'bholmesdev' }),
			});
			const res = await app.render(req);

			assert.equal(res.ok, true);
			assert.equal(res.headers.get('Content-Type'), 'application/json+devalue');

			const data = devalue.parse(await res.text());
			assert.equal(data.channel, 'bholmesdev');
			assert.equal(data.subscribeButtonState, 'smashed');
		});

		it('Exposes comment action', async () => {
			const formData = new FormData();
			formData.append('channel', 'bholmesdev');
			formData.append('comment', 'Hello, World!');
			const req = new Request('http://example.com/_actions/comment', {
				method: 'POST',
				body: formData,
			});
			const res = await app.render(req);

			assert.equal(res.ok, true);
			assert.equal(res.headers.get('Content-Type'), 'application/json+devalue');

			const data = devalue.parse(await res.text());
			assert.equal(data.channel, 'bholmesdev');
			assert.equal(data.comment, 'Hello, World!');
		});

		it('Raises validation error on bad form data', async () => {
			const formData = new FormData();
			formData.append('channel', 'bholmesdev');
			const req = new Request('http://example.com/_actions/comment', {
				method: 'POST',
				body: formData,
			});
			const res = await app.render(req);

			assert.equal(res.ok, false);
			assert.equal(res.status, 400);
			assert.equal(res.headers.get('Content-Type'), 'application/json');

			const data = await res.json();
			assert.equal(data.type, 'AstroActionInputError');
		});

		it('Exposes plain formData action', async () => {
			const formData = new FormData();
			formData.append('channel', 'bholmesdev');
			formData.append('comment', 'Hello, World!');
			const req = new Request('http://example.com/_actions/commentPlainFormData', {
				method: 'POST',
				body: formData,
			});
			const res = await app.render(req);

			assert.equal(res.ok, true);
			assert.equal(res.headers.get('Content-Type'), 'application/json+devalue');

			const data = devalue.parse(await res.text());
			assert.equal(data.success, true);
			assert.equal(data.isFormData, true, 'Should receive plain FormData');
		});

		it('Response middleware fallback', async () => {
			const req = new Request('http://example.com/user?_astroAction=getUser', {
				method: 'POST',
				body: new FormData(),
				headers: {
					Referer: 'http://example.com/user',
				},
			});
			const res = await followRedirect(req, app);
			assert.equal(res.ok, true);

			const html = await res.text();
			let $ = cheerio.load(html);
			assert.equal($('#user').text(), 'Houston');
		});

		it('Respects custom errors', async () => {
			const req = new Request('http://example.com/user-or-throw?_astroAction=getUserOrThrow', {
				method: 'POST',
				body: new FormData(),
				headers: {
					Referer: 'http://example.com/user-or-throw',
				},
			});
			const res = await followRedirect(req, app);
			assert.equal(res.status, 401);

			const html = await res.text();
			console.log({ html });
			let $ = cheerio.load(html);
			assert.equal($('#error-message').text(), 'Not logged in');
			assert.equal($('#error-code').text(), 'UNAUTHORIZED');
		});

		describe('legacy', () => {
			it('Response middleware fallback', async () => {
				const formData = new FormData();
				formData.append('_astroAction', 'getUser');
				const req = new Request('http://example.com/user', {
					method: 'POST',
					body: formData,
					headers: {
						Referer: 'http://example.com/user',
					},
				});
				const res = await followRedirect(req, app);
				assert.equal(res.ok, true);

				const html = await res.text();
				let $ = cheerio.load(html);
				assert.equal($('#user').text(), 'Houston');
			});

			it('Respects custom errors', async () => {
				const formData = new FormData();
				formData.append('_astroAction', 'getUserOrThrow');
				const req = new Request('http://example.com/user-or-throw', {
					method: 'POST',
					body: formData,
					headers: {
						Referer: 'http://example.com/user-or-throw',
					},
				});
				const res = await followRedirect(req, app);
				assert.equal(res.status, 401);

				const html = await res.text();
				let $ = cheerio.load(html);
				assert.equal($('#error-message').text(), 'Not logged in');
				assert.equal($('#error-code').text(), 'UNAUTHORIZED');
			});
		});

		it('Sets status to 204 when no content', async () => {
			const req = new Request('http://example.com/_actions/fireAndForget', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Content-Length': '0',
				},
			});
			const res = await app.render(req);
			assert.equal(res.status, 204);
		});

		it('Is callable from the server with rewrite', async () => {
			const req = new Request('http://example.com/rewrite');
			const res = await app.render(req);
			assert.equal(res.ok, true);

			const html = await res.text();
			let $ = cheerio.load(html);
			assert.equal($('[data-url]').text(), '/subscribe');
			assert.equal($('[data-channel]').text(), 'bholmesdev');
		});

		it('Returns content when the value is 0', async () => {
			const req = new Request('http://example.com/_actions/zero', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Content-Length': '0',
				},
			});
			const res = await app.render(req);
			assert.equal(res.status, 200);
			const value = devalue.parse(await res.text());
			assert.equal(value, 0);
		});

		it('Returns content when the value is false', async () => {
			const req = new Request('http://example.com/_actions/false', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Content-Length': '0',
				},
			});
			const res = await app.render(req);
			assert.equal(res.status, 200);

			const value = devalue.parse(await res.text());
			assert.equal(value, false);
		});

		it('Supports complex values: Date, Set, URL', async () => {
			const req = new Request('http://example.com/_actions/complexValues', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Content-Length': '0',
				},
			});
			const res = await app.render(req);
			assert.equal(res.status, 200);
			assert.equal(res.headers.get('Content-Type'), 'application/json+devalue');

			const value = devalue.parse(await res.text(), {
				URL: (href) => new URL(href),
			});
			assert.ok(value.date instanceof Date);
			assert.ok(value.set instanceof Set);
		});
	});
});

const validRedirectStatuses = new Set([301, 302, 303, 304, 307, 308]);

/**
 * Follow an expected redirect response.
 *
 * @param {Request} req
 * @param {*} app
 * @returns {Promise<Response>}
 */
async function followRedirect(req, app) {
	const redirect = await app.render(req, { addCookieHeader: true });
	assert.ok(
		validRedirectStatuses.has(redirect.status),
		`Expected redirect status, got ${redirect.status}`
	);

	const redirectUrl = new URL(redirect.headers.get('Location'), req.url);
	const redirectReq = new Request(redirectUrl, {
		headers: {
			Cookie: redirect.headers.get('Set-Cookie'),
		},
	});
	return app.render(redirectReq);
}
