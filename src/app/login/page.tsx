import { login } from './actions';

export default async function LoginPage({
  searchParams,
}: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50">
      <form action={login} className="bg-white p-8 rounded-xl shadow w-full max-w-sm space-y-4">
        <h1 className="text-xl font-bold text-gray-900">CRM THACO Auto</h1>
        {error && <p className="text-red-600 text-sm">Sai email hoặc mật khẩu.</p>}
        <input name="email" type="email" placeholder="Email" required
          className="w-full border rounded-lg px-3 py-2" />
        <input name="password" type="password" placeholder="Mật khẩu" required
          className="w-full border rounded-lg px-3 py-2" />
        <button type="submit"
          className="w-full bg-blue-700 text-white rounded-lg py-2 font-medium">Đăng nhập</button>
      </form>
    </main>
  );
}
