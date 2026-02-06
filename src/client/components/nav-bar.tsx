import { Link } from "react-router-dom";
import { useAuth } from "../contexts/auth-context";
import "./navbar.css";

export function NavBar() {
  const { user, logout } = useAuth();

  return (
    <nav className="navbar">
      <div className="navbar-brand">
        <Link className="navbar-logo" to="/">
          gist.party
        </Link>
      </div>
      <div className="navbar-auth">
        {user ? (
          <div className="navbar-user">
            <img
              alt={user.login}
              className="navbar-avatar"
              height={32}
              src={user.avatarUrl}
              width={32}
            />
            <span className="navbar-username">{user.login}</span>
            <button className="navbar-logout" onClick={logout} type="button">
              Logout
            </button>
          </div>
        ) : (
          <a className="navbar-signin" href="/api/auth/github">
            Sign in with GitHub
          </a>
        )}
      </div>
    </nav>
  );
}
