// Entry point for SPA

const { BrowserRouter, Routes, Route, Link } = ReactRouterDOM;

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
        <Link to="/">Home</Link> | <Link to="/dashboard">Dashboard</Link>
      </nav>
      <ToastContainer />
      <Routes>
        <Route path="/dashboard" element={React.createElement((window as any).Dashboard)} />
        <Route path="/*" element={React.createElement((window as any).App)} />
      </Routes>
    </BrowserRouter>
  );
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(<Main />);
