'use client';

export default function SignInPage() {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', backgroundColor: '#0A0C0F'
    }}>
      <div style={{
        background: '#12151A', border: '1px solid #252C35',
        borderRadius: 10, padding: 40, textAlign: 'center', maxWidth: 360, width: '100%'
      }}>
        <div style={{ fontSize: 28, fontWeight: 900, color: '#F59E0B', marginBottom: 8 }}>WMS</div>
        <div style={{ color: '#8A95A3', fontSize: 14, marginBottom: 32 }}>24C Warehouse Management</div>
        <form action="/api/auth/signin/google" method="POST">
          <input type="hidden" name="csrfToken" value="" />
          <button
            type="submit"
            style={{
              display: 'block', width: '100%', background: '#F59E0B', color: '#0A0C0F',
              padding: '12px 24px', borderRadius: 6, fontWeight: 700,
              border: 'none', fontSize: 15, cursor: 'pointer'
            }}>
            Sign in with Google
          </button>
        </form>
      </div>
    </div>
  );
}