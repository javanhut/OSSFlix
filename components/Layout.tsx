import { Outlet } from "react-router-dom";
import NavBar from "./Navbar";
import MediaCarousel from "./MediaCarousel";

export default function Layout() {
  const ml = [];
  ml.push({
    imagePath: "placeholder",
    title: "placeholder-title",
    description: "placholder-descripton"
  })
  return (
    <>
      <NavBar />
      <MediaCarousel mediaList={ml}/>
      <Outlet />
    </>
  );
}
