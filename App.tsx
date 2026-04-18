import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { ProfileProvider, useProfile } from "./context/ProfileContext";
import Layout from "./components/Layout";
import Home from "./pages/Hero";
import Movies from "./pages/Movies";
import TVShows from "./pages/TVShows";
import Genre from "./pages/Genre";
import Anime from "./pages/Anime";
import Login from "./pages/Login";
import ProfileSelect from "./pages/ProfileSelect";
import History from "./pages/History";
import MyList from "./pages/MyList";
import Explore from "./pages/Explore";
import ForYou from "./pages/ForYou";
import Stats from "./pages/Stats";
import Admin from "./pages/Admin";

function AppRoutes() {
  const { authenticated, profile, loading } = useProfile();
  const location = useLocation();

  // Admin route is always accessible
  if (location.pathname === "/admin") {
    return (
      <Routes>
        <Route path="/admin" element={<Admin />} />
      </Routes>
    );
  }

  // Show spinner while checking session
  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(180deg, #0a0a0f 0%, #12121e 50%, #0a0a0f 100%)",
        }}
      >
        <div
          style={{
            width: "48px",
            height: "48px",
            border: "3px solid rgba(255,255,255,0.1)",
            borderTopColor: "#3b82f6",
            borderRadius: "50%",
            animation: "appSpin 0.8s linear infinite",
          }}
        />
        <style>{`@keyframes appSpin { to { transform: rotate(360deg) } }`}</style>
      </div>
    );
  }

  // Not authenticated → Login page
  if (!authenticated) {
    return (
      <Routes>
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }

  // Fully authenticated with active profile → App
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/home" element={<Home />} />
        <Route path="/movies" element={<Movies />} />
        <Route path="/tvshows" element={<TVShows />} />
        <Route path="/anime" element={<Anime />} />
        <Route path="/genre/:genre" element={<Genre />} />
        <Route path="/explore" element={<Explore />} />
        <Route path="/foryou" element={<ForYou />} />
        <Route path="/history" element={<History />} />
        <Route path="/mylist" element={<MyList />} />
        <Route path="/stats" element={<Stats />} />
      </Route>
      <Route path="/profiles" element={<ProfileSelect />} />
      <Route path="*" element={<Navigate to="/home" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <ProfileProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </ProfileProvider>
  );
}
