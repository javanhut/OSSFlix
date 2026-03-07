import { Navbar, NavbarToggle, NavDropdown, NavbarBrand, Container, NavbarCollapse, Form, FormControl, Nav, Button, NavLink } from "react-bootstrap";
import { Link } from "react-router-dom";
import Profile from "./ProfileSettings";
import { movieGenres } from "../constants/Genres";
export function NavBar() {
  return (
    <Navbar expand="lg" className="bg-body-tertiary">
      <Container fluid>
        <NavbarBrand as={Link} to="/">OSSFlix</NavbarBrand>
        <NavbarToggle />
        <NavbarCollapse>
          <Nav className="me-auto">
            <NavLink as={Link} to="/movies">Movies</NavLink>
            <NavLink as={Link} to="/tvshows">TV Shows</NavLink>
            <NavDropdown title="Genres">
            {
              movieGenres.map((genre) =>  (
                <NavDropdown.Item key={genre}>{genre}</NavDropdown.Item>
              )
                             )
            }
            </NavDropdown>
          </Nav>
          <div className="d-flex align-items-center gap-3">
            <Form className="d-flex">
              <FormControl type="search" placeholder="Search..." className="me-2" aria-label="Search" />
              <Button variant="outline-success">Search</Button>
            </Form>
            <Profile />
          </div>
        </NavbarCollapse>
      </Container>
    </Navbar>
  );
}

export default NavBar;
