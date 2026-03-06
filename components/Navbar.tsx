import { Navbar, NavbarToggle, NavbarBrand, Container, NavbarCollapse, Form, FormControl, Nav, Button } from "react-bootstrap";
import { Link } from "react-router-dom";

export function NavBar() {
  return (
    <Navbar expand="lg" className="bg-body-tertiary">
      <Container fluid>
        <NavbarBrand as={Link} to="/">OSSFlix</NavbarBrand>
        <NavbarToggle />
        <NavbarCollapse>
          <Nav>
            <Nav.Link as={Link} to="/movies">Movies</Nav.Link>
            <Nav.Link as={Link} to="/tvshows">TV Shows</Nav.Link>
          </Nav>
          <Form className="d-flex">
            <FormControl type="search" placeholder="Search..." className="me-2" aria-label="Search" />
            <Button variant="outline-success">Search</Button>
          </Form>
        </NavbarCollapse>
      </Container>
    </Navbar>
  );
}

export default NavBar;
