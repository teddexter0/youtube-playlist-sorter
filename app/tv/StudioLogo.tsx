"use client";
import Image from "next/image";
import { useState } from "react";
import { studioDomains } from "@/lib/studio-sources";
export default function StudioLogo({ handle, name }: { handle: string; name: string }) {
  const [failed, setFailed] = useState(false);
  return <span className="studio-identity">{!failed && studioDomains[handle] ? <Image src={`https://www.google.com/s2/favicons?domain=${studioDomains[handle]}&sz=128`} width={48} height={48} unoptimized alt="" onError={() => setFailed(true)} /> : <span className="studio-monogram" aria-hidden="true">{name.slice(0, 2)}</span>}<span>{name}</span></span>;
}
