import { Outlet, useLocation } from "react-router-dom";
import NavBar from "./Navbar";

export default function Layout() {
  const location = useLocation();

  return (
    <div className="oss-page">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <NavBar />
      <div id="main-content" key={location.pathname} className="page-transition-wrapper">
        <Outlet />
      </div>
    </div>
  );
}
