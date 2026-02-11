"use client";

import { useState } from "react";
import { User } from "lucide-react";

interface SafeImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  fallbackClassName?: string;
}

export function SafeImage({
  src,
  alt,
  className,
  fallbackClassName,
  ...props
}: SafeImageProps) {
  const [error, setError] = useState(false);

  if (error || !src) {
    return (
      <div
        className={`flex items-center justify-center bg-muted text-muted-foreground ${className ?? ""} ${fallbackClassName ?? ""}`}
        aria-label={alt}
      >
        <User className="h-1/2 w-1/2 opacity-40" />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onError={() => setError(true)}
      {...props}
    />
  );
}
