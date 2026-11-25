// Landing page of the Microsoft sign-in popup: hands the result to the app window and closes.
const q = new URLSearchParams(location.search);
try { window.opener?.postMessage({ type: 'bpm-ms', code: q.get('code'), state: q.get('state'), error: q.get('error_description') || q.get('error') }, location.origin); } catch { }
document.body.textContent = q.get('error') ? 'Sign-in failed: ' + (q.get('error_description') || q.get('error')) : 'Signed in. You can close this window.';
setTimeout(() => window.close(), 400);
