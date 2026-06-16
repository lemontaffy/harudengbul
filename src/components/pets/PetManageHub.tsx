"use client";

import { useState } from "react";
import PetManageView, { type ManagePet } from "./PetManageView";
import ItemsLibraryView, { type LibraryItem } from "./ItemsLibraryView";
import SceneBackgroundsView, { type SceneBg } from "./SceneBackgroundsView";
import type { PetRef } from "./types";

type Tab = "pets" | "items" | "scenes";

// 전역 관리 허브 — 방과 무관한 관리들을 한곳에. 펫 / 아이템·가구 / 장면 배경.
export default function PetManageHub({
  pets,
  rooms,
  allPets,
  items,
  sceneBackgrounds = [],
  initialTab = "pets",
}: {
  pets: ManagePet[];
  rooms: PetRef[];
  allPets: PetRef[];
  items: LibraryItem[];
  sceneBackgrounds?: SceneBg[];
  initialTab?: Tab;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        {(
          [
            ["pets", "펫"],
            ["items", "아이템·가구"],
            ["scenes", "장면 배경"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`flex-1 rounded-control px-2 py-2 text-sm ${
              tab === k ? "bg-accent text-black" : "bg-surface-2 ring-1 ring-border"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "pets" ? (
        <PetManageView pets={pets} rooms={rooms} allPets={allPets} />
      ) : tab === "items" ? (
        <ItemsLibraryView items={items} />
      ) : (
        <SceneBackgroundsView initial={sceneBackgrounds} />
      )}
    </div>
  );
}
