import { permanentRedirect } from "next/navigation";

export default function ShopRedirect() {
  permanentRedirect("/products");
}
