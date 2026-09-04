import Button from "@/components/ui/button/Button";

type ProductImageThumbnailProps = {
  image?: {
    url: string;
    alt: string;
  } | null;
  actionLabel: string;
  onClick: () => void;
};

export default function ProductImageThumbnail({ image, actionLabel, onClick }: ProductImageThumbnailProps) {
  if (!image) {
    return (
      <span
        aria-hidden="true"
        className="flex h-12 w-12 shrink-0 items-center justify-center text-xs"
      >
        —
      </span>
    );
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-12 w-12 shrink-0 p-0"
      aria-label={actionLabel}
      onClick={onClick}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={image.url}
        alt={image.alt}
        className="h-12 w-12 object-contain"
        loading="lazy"
      />
    </Button>
  );
}
