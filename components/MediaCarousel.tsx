import { Carousel, CarouselCaption, CarouselItem, Image } from "react-bootstrap";

type MediaItem = {
  imagePath: string;
  title: string;
  description: string;
};

type MediaCarouselProps = {
  mediaList: MediaItem[];
};

export default function MediaCarousel({ mediaList }: MediaCarouselProps) {
  return (<>
            <Carousel>
            {
              mediaList.map((element) => (
              <CarouselItem key={element.imagePath}>
              <Image src={element.imagePath} alt={element.title} />
              <CarouselCaption>
              <h2>{element.title}</h2>
              <p>{element.description}</p>
              </CarouselCaption>
              </CarouselItem>
              )
                           ) 
            }
            </Carousel>
          </>);
}
