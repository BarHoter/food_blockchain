// Entry point for SPA
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import App from './app';
import Dashboard from './dashboard';
import Admin from './admin';

function ToastContainer(): JSX.Element | null {
  const [msg, setMsg] = React.useState('');
  React.useEffect(() => {
    if (!msg) return;
    const id = setTimeout(() => setMsg(''), 3000);
    return () => clearTimeout(id);
  }, [msg]);
  (window as any).showToast = (m: string) => setMsg(m);
  return msg ? <div className="toast">{msg}</div> : null;
}

function Main(): JSX.Element {
  return (
    <BrowserRouter>
      <nav className="nav">
        <Link to="/">Home</Link> |{' '}
        <Link to="/dashboard">Dashboard</Link> |{' '}
        <Link to="/admin">Admin</Link>
      </nav>
      <ToastContainer />
      <Routes>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/*" element={<App />} />
      </Routes>
    </BrowserRouter>
  );
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(<Main />);
