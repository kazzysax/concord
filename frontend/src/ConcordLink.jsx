import React, { useEffect, useState } from "react";
import { useAuth } from "./AuthContext.jsx";
import { makeApi } from "./api.js";
import ConferenceRoom from "./ConferenceRoom.jsx";
import Login from "./Login.jsx";
import TrackPage from "./TrackPage.jsx";
import DeedDocument from "./DeedDocument.jsx";

function DeedView({ concordId }) {
  const { getAccessToken } = useAuth();
  const api = makeApi(getAccessToken);
  const [concord, setConcord] = useState(null);
  useEffect(() => { api.getConcord(concordId).then(setConcord); }, [concordId]);
  if (!concord) return <p style={{ color: app.textMuted, fontFamily: font.sans, paddingTop: 32 }}>Loading…</p>;
  return <div style={{ paddingTop: 32 }}><DeedDocument contract={concord.frozenContract} parties={concord.parties} /></div>;
}

import { card as sharedCard } from "./ui.js";
import { app, font } from "./theme.js";
const card = { ...sharedCard, textAlign: "center", padding: "2rem 1.5rem", marginTop: 40 };


// One URL, used for the entire life of a concord: /c/{concordId}?token={inviteToken}
// The token only matters on a client's first click - after that this
// component just asks the backend "where does this user go right now."
export default function ConcordLink({ concordId, inviteToken }) {
  const { user, authenticated, login, getAccessToken } = useAuth();
  const api = makeApi(getAccessToken);
  const [resolution, setResolution] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!authenticated) return;
    api.resolve(concordId, inviteToken).then(res => {
      if (res.error) setError(res.error);
      else setResolution(res);
    });
  }, [authenticated, concordId]);

  if (!authenticated) {
    return <Login onSignedIn={() => {}} />;
  }

  if (error) return <div style={{ ...card, color: "#E3B341", fontFamily: font.sans }}>{error}</div>;
  if (!resolution) return <p style={{ color: app.textMuted, fontFamily: font.sans, paddingTop: 32 }}>Loading…</p>;

  switch (resolution.destination) {
    case "conference_room":
      return <ConferenceRoom concordId={concordId} onFrozen={() => setResolution({ ...resolution, destination: "contract" })} />;
    case "contract":
      return <DeedView concordId={concordId} />;
    case "payment":
    case "settled":
      return <TrackPage concordId={concordId} />;
    default:
      return <p>Unknown state.</p>;
  }
}

function PlaceholderScreen({ title, note }) {
  return (
    <div style={card}>
      <p style={{ margin: "0 0 8px", fontWeight: 500, color: app.text }}>{title}</p>
      <p style={{ margin: 0, fontSize: 13, color: app.textMuted }}>{note}</p>
    </div>
  );
}
