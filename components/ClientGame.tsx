"use client";

import dynamic from "next/dynamic";

const LanternKeeperGame = dynamic(() => import("./LanternKeeperGame"), {
  ssr: false,
  loading: () => <div style={{ width: "100%", height: "100%", background: "#08101a" }} />,
});

export default function ClientGame() {
  return (
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden", background: "#08101a" }}>
      <LanternKeeperGame />
    </div>
  );
}
