// app/proxy
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest): Promise<NextResponse> {
	try {
		const url = new URL(request.url);

		let actualUrlStr: string;

		if (!url.pathname.startsWith('/proxy/')) {
			// 从Cookie中读取之前访问的网站
			const cookie = request.headers.get('cookie');
			if (cookie) {
				const cookieObj: Record<string, string> = Object.fromEntries(
					cookie.split(';').map((cookie) => {
						const [key, ...val] = cookie.trim().split('=');
						return [key.trim(), val.join('=').trim()];
					})
				);
				if (cookieObj.current_site) {
					// 解码 URL
					actualUrlStr = decodeURIComponent(cookieObj.current_site) + url.pathname + url.search + url.hash;
					console.log('actualUrlStr in cookieObj:', actualUrlStr);
					const actualUrl = new URL(actualUrlStr);
					const redirectUrl = `${url.origin}/proxy/${encodeURIComponent(actualUrl.toString())}`;
					return NextResponse.redirect(redirectUrl, 301);
				} else {
					return new NextResponse(`No website in cookie. Please visit a website first.`, {
						status: 400,
						headers: { 'Content-Type': 'text/plain' },
					});
				}
			} else {
				return new NextResponse(`No cookie found. Please visit a website first.`, {
					status: 400,
					headers: { 'Content-Type': 'text/plain' },
				});
			}
		} else {
			// 解码 URL
			actualUrlStr = decodeURIComponent(url.pathname.replace('/proxy/', '') + url.search + url.hash);
		}

		const actualUrl = new URL(actualUrlStr);
		const modifiedRequest = new Request(actualUrl.toString(), {
			headers: request.headers,
			method: request.method,
			body: request.body,
			redirect: 'follow',
		});

		let response = await fetch(modifiedRequest);
		const baseUrl = `${url.origin}/proxy/${encodeURIComponent(actualUrl.origin)}`;
		if (response.headers.get('Content-Type')?.includes('text/html')) {
			response = await updateRelativeUrls(response, baseUrl, `${url.origin}/proxy/`);
		}

		const modifiedResponse = new NextResponse(response.body, {
			headers: response.headers,
		});
		modifiedResponse.headers.set('Access-Control-Allow-Origin', '*');
		const currentSiteCookie = `current_site=${encodeURIComponent(actualUrl.origin)}; Path=/; Secure`;
		modifiedResponse.headers.append('Set-Cookie', currentSiteCookie);

		return modifiedResponse;
	} catch (e) {
		let pathname = new URL(request.url).pathname;
		return new NextResponse(`"${pathname}" not found`, {
			status: 404,
			statusText: 'Not Found',
		});
	}
}

async function updateRelativeUrls(response: Response, baseUrl: string, prefix: string): Promise<Response> {
	let text = await response.text();

	text = text.replace(/(href|src|action)="([^"]*?)"/g, (match, p1, p2) => {
		if (!p2.includes('://') && !p2.startsWith('#')) {
			return `${p1}="${baseUrl}${p2}"`;
		} else if (p2.includes('://') && !match.includes('js') && !match.includes('css') && !match.includes('mjs')) {
			return `${p1}="${prefix}${p2}"`;
		}
		return match;
	});

	return new Response(text, {
		headers: response.headers,
	});
}