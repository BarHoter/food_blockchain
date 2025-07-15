// Entry point for SPA
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import App from './app';
import Dashboard from './dashboard';
import './darkmode.js';
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
      <header className="site-header">
        <h1>BatchToken Demo</h1>
        <nav className="nav">
          <Link to="/">Home</Link>
          <Link to="/dashboard">Dashboard</Link>
          <Link to="/admin">Admin</Link>
        </nav>
        <label className="switch" title="Toggle dark mode">
          <input type="checkbox" id="toggleDarkMode" />
          <span className="slider"></span>
        </label>
      </header>
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
