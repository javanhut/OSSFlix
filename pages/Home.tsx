import { Button } from "react-bootstrap";
import { useState } from "react";
import { Card } from "../components/Card";

export default function Home() {
  const [openModal, setOpenModal] = useState(false);
  const changeModalState = () => {
    setOpenModal((prev) => !prev);
  };
  return (
    <div>
      <p>Is Modal Open?: {openModal.toString().toUpperCase()}</p>
      <Button onClick={changeModalState}>Open Modal</Button>
      <Card show={openModal} onHide={changeModalState} />
    </div>
  );
}
