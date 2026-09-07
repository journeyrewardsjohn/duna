"use client";

export function VideoPosterImage({ src }: { readonly src: string }) {
  return (
    <img
      alt=""
      loading="lazy"
      onError={(event) => {
        event.currentTarget.hidden = true;
      }}
      src={src}
    />
  );
}
