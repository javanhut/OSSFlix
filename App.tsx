import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
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

function AppRoutes() {
  const { authenticated, profile } = useProfile();

  // Not authenticated → Login page
  if (!authenticated) {
    return (
      <Routes>
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }

  // Authenticated but no active profile → Profile select
  if (!profile?.id) {
    return (
      <Routes>
        <Route path="/profiles" element={<ProfileSelect />} />
        <Route path="*" element={<Navigate to="/profiles" replace />} />
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
        <Route path="/history" element={<History />} />
        <Route path="/mylist" element={<MyList />} />
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
