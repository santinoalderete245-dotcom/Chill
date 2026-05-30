import { useState, useEffect, useRef } from "react";

const C = {
  bg: "#0f0f1e",
  surface: "#1a1a2e",
  surface2: "#262641",
  surface3: "#2f2f47",
  primary: "#7C5CFF",
  secondary: "#B9AEFF",
  accent: "#9078FF",
  text: "#f5f5f5",
  textMuted: "#a0a0b0",
  border: "#353550",
  success: "#10b981",
  error: "#ef4444",
};

function fmt(s) {
  if (!s || isNaN(s)) return "0:00";
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

function parseName(filename) {
  const base = filename.replace(/\.[^.]+$/, "");
  const i = base.indexOf(" - ");
  return i > 0
    ? { artist: base.slice(0, i).trim(), title: base.slice(i + 3).trim() }
    : { artist: "", title: base };
}

function Avatar({ title, size = 44 }) {
  const colors = ["#7C5CFF", "#B9AEFF", "#9078FF", "#8B6FFF", "#A599FF", "#9D8AFF"];
  const idx = title ? title.charCodeAt(0) % colors.length : 0;
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.15,
        flexShrink: 0,
        background: `linear-gradient(135deg, ${colors[idx]}, ${colors[(idx + 1) % colors.length]})`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.4,
        fontWeight: 700,
        color: "#fff",
        boxShadow: `0 0 10px ${colors[idx]}25`,
      }}
    >
      {title ? title[0].toUpperCase() : "♪"}
    </div>
  );
}

export default function App() {
  const [songs, setSongs] = useState([]);
  const [current, setCurrent] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [volumeShowFeedback, setVolumeShowFeedback] = useState(false);
  const volumeFeedbackTimeoutRef = useRef(null);
  const [tab, setTab] = useState("library");
  const [lyrics, setLyrics] = useState("");
  const [lyricsStatus, setLyricsStatus] = useState("idle");
  const [playlists, setPlaylists] = useState([]);
  const [newPLName, setNewPLName] = useState("");
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const [bars, setBars] = useState(new Array(64).fill(2));
  const [dragging, setDragging] = useState(false);
  const [miniMode, setMiniMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [history, setHistory] = useState([]);
  const [eq, setEq] = useState([0, 0, 0, 0, 0]);

  const audioRef = useRef(null);
  const ctxRef = useRef(null);
  const analyserRef = useRef(null);
  const rafRef = useRef(null);
  const currentRef = useRef(null);
  const songsRef = useRef([]);
  const shuffleRef = useRef(false);
  const repeatRef = useRef(false);

  useEffect(() => {
    currentRef.current = current;
  }, [current]);
  useEffect(() => {
    songsRef.current = songs;
  }, [songs]);
  useEffect(() => {
    shuffleRef.current = shuffle;
  }, [shuffle]);
  useEffect(() => {
    repeatRef.current = repeat;
  }, [repeat]);

  function ensureCtx() {
    if (ctxRef.current) return;
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.85;
    const src = ctx.createMediaElementSource(audioRef.current);
    src.connect(analyser);
    analyser.connect(ctx.destination);
    ctxRef.current = ctx;
    analyserRef.current = analyser;
  }

  function tick() {
    if (!analyserRef.current) return;
    const data = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(data);
    const n = 64;
    const step = Math.floor(data.length / n);
    setBars(
      Array.from({ length: n }, (_, i) => {
        const val = (data[i * step] / 255) * 100;
        return Math.max(3, val);
      })
    );
    rafRef.current = requestAnimationFrame(tick);
  }

  function playSong(idx) {
    const s = songsRef.current;
    if (!s[idx]) return;
    const audio = audioRef.current;
    audio.src = s[idx].url;
    audio.volume = volume;
    audio.play()
      .then(() => {
        ensureCtx();
        if (ctxRef.current?.state === "suspended") ctxRef.current.resume();
        cancelAnimationFrame(rafRef.current);
        tick();
      })
      .catch(() => {});
    setCurrent(idx);
    setPlaying(true);
    setLyrics("");
    setLyricsStatus("idle");
    setHistory((prev) => {
      const newHist = [s[idx].id, ...prev.filter((id) => id !== s[idx].id)];
      return newHist.slice(0, 50);
    });
  }

  function nextSong() {
    const s = songsRef.current;
    const c = currentRef.current;
    if (!s.length) return;
    if (repeatRef.current && c !== null) {
      playSong(c);
      return;
    }
    const next = shuffleRef.current
      ? Math.floor(Math.random() * s.length)
      : c === null
        ? 0
        : (c + 1) % s.length;
    playSong(next);
  }

  function prevSong() {
    const s = songsRef.current;
    const c = currentRef.current;
    if (!s.length || c === null) return;
    playSong((c - 1 + s.length) % s.length);
  }

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio.src) return;
    if (playing) {
      audio.pause();
      cancelAnimationFrame(rafRef.current);
      setBars(new Array(64).fill(2));
    } else {
      audio.play();
      ensureCtx();
      if (ctxRef.current?.state === "suspended") ctxRef.current.resume();
      tick();
    }
    setPlaying((p) => !p);
  }

  useEffect(() => {
    const audio = audioRef.current;
    const onTime = () => setProgress(audio.currentTime);
    const onDur = () => setDuration(audio.duration);
    const onEnd = () => nextSong();
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("durationchange", onDur);
    audio.addEventListener("ended", onEnd);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("durationchange", onDur);
      audio.removeEventListener("ended", onEnd);
    };
  }, []);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  function loadFiles(files) {
    const valid = Array.from(files).filter((f) => f.type.startsWith("audio/"));
    const newSongs = valid.map((f) => ({
      file: f,
      url: URL.createObjectURL(f),
      ...parseName(f.name),
      id: Math.random().toString(36).slice(2),
    }));
    setSongs((prev) => {
      const updated = [...prev, ...newSongs];
      songsRef.current = updated;
      return updated;
    });
  }

  async function fetchLyrics() {
    const c = currentRef.current;
    const s = songsRef.current;
    if (c === null || !s[c]) return;
    const { artist, title } = s[c];
    if (!artist) {
      setLyricsStatus("notfound");
      setLyrics(
        "No se pudo detectar el artista.\\nRenombrá el archivo como: Artista - Título.mp3"
      );
      return;
    }
    setLyricsStatus("loading");
    setLyrics("");
    try {
      const res = await fetch(
        `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`
      );
      const data = await res.json();
      if (data.lyrics) {
        setLyrics(data.lyrics);
        setLyricsStatus("found");
      } else {
        setLyricsStatus("notfound");
        setLyrics("No se encontraron letras para esta canción.");
      }
    } catch {
      setLyricsStatus("notfound");
      setLyrics("Error al conectarse al servicio de letras.");
    }
  }

  useEffect(() => {
    if (tab === "lyrics" && current !== null && lyricsStatus === "idle")
      fetchLyrics();
  }, [tab, current]);

  function createPL() {
    if (!newPLName.trim()) return;
    setPlaylists((p) => [
      ...p,
      { id: Date.now(), name: newPLName.trim(), songIds: [] },
    ]);
    setNewPLName("");
  }

  function addToPL(plId, songId) {
    setPlaylists((p) =>
      p.map((pl) =>
        pl.id === plId && !pl.songIds.includes(songId)
          ? { ...pl, songIds: [...pl.songIds, songId] }
          : pl
      )
    );
  }

  function removeFromPL(plId, songId) {
    setPlaylists((p) =>
      p.map((pl) =>
        pl.id === plId
          ? { ...pl, songIds: pl.songIds.filter((id) => id !== songId) }
          : pl
      )
    );
  }

  function deletePL(plId) {
    setPlaylists((p) => p.filter((pl) => pl.id !== plId));
  }

  const filteredSongs = songs.filter(
    (s) =>
      s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.artist.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const currentSong = current !== null ? songs[current] : null;

  const iconBtn = (active, title) => ({
    background: "transparent",
    border: "none",
    color: active ? C.secondary : C.textMuted,
    cursor: "pointer",
    fontSize: 18,
    padding: "8px 10px",
    borderRadius: 8,
    title,
    transition: "all 0.3s ease",
  });

  const handleVolumeChange = (e) => {
    setVolume(+e.target.value);
    setVolumeShowFeedback(true);
    
    if (volumeFeedbackTimeoutRef.current) {
      clearTimeout(volumeFeedbackTimeoutRef.current);
    }
    volumeFeedbackTimeoutRef.current = setTimeout(() => {
      setVolumeShowFeedback(false);
    }, 1500);
  };

  // Mini Mode Component
  if (miniMode) {
    return (
      <div
        style={{
          position: "fixed",
          bottom: 20,
          right: 20,
          width: 320,
          background: `linear-gradient(135deg, ${C.surface}dd, ${C.surface2}dd)`,
          border: `1px solid ${C.primary}35`,
          borderRadius: 16,
          padding: 16,
          color: C.text,
          fontFamily: "'Segoe UI', system-ui, sans-serif",
          boxShadow: `0 20px 60px rgba(124, 92, 255, 0.15)`,
          zIndex: 9999,
          backdropFilter: "blur(10px)",
        }}
      >
        <audio ref={audioRef} style={{ display: "none" }} />

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 700, color: C.secondary }}>CHILL.</span>
          <button
            onClick={() => setMiniMode(false)}
            style={{
              background: "transparent",
              border: "none",
              color: C.textMuted,
              cursor: "pointer",
              fontSize: 20,
            }}
          >
            ⛶
          </button>
        </div>

        {currentSong && (
          <div style={{ marginBottom: 12, textAlign: "center" }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
              {currentSong.title.substring(0, 30)}
            </div>
            <div style={{ fontSize: 10, color: C.textMuted }}>
              {currentSong.artist.substring(0, 25)}
            </div>
          </div>
        )}

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            marginBottom: 12,
          }}
        >
          <button
            onClick={prevSong}
            style={{
              ...iconBtn(false),
              fontSize: 16,
              padding: "6px 8px",
            }}
          >
            ⏮
          </button>
          <button
            onClick={togglePlay}
            style={{
              background: `linear-gradient(135deg, ${C.primary}, ${C.accent})`,
              border: "none",
              color: "#fff",
              width: 40,
              height: 40,
              borderRadius: "50%",
              cursor: "pointer",
              fontSize: 16,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: `0 0 10px ${C.primary}35`,
            }}
          >
            {playing ? "⏸" : "▶"}
          </button>
          <button
            onClick={nextSong}
            style={{
              ...iconBtn(false),
              fontSize: 16,
              padding: "6px 8px",
            }}
          >
            ⏭
          </button>
        </div>

        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.1}
          value={progress}
          onChange={(e) => {
            audioRef.current.currentTime = +e.target.value;
            setProgress(+e.target.value);
          }}
          style={{
            width: "100%",
            accentColor: C.secondary,
            cursor: "pointer",
            marginBottom: 6,
          }}
        />

        <div
          style={{
            fontSize: 10,
            color: C.textMuted,
            textAlign: "center",
          }}
        >
          {fmt(progress)} / {fmt(duration)}
        </div>
      </div>
    );
  }

  // Full Mode Component
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        background: `linear-gradient(135deg, ${C.bg}, #131323)`,
        color: C.text,
        fontFamily: "'Segoe UI', system-ui, sans-serif",
        overflow: "hidden",
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        loadFiles(e.dataTransfer.files);
      }}
    >
      <audio ref={audioRef} style={{ display: "none" }} />

      {dragging && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: `rgba(124, 92, 255, 0.1)`,
            border: `3px dashed ${C.primary}`,
            zIndex: 99,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 0,
            pointerEvents: "none",
          }}
        >
          <p
            style={{
              fontSize: 28,
              fontWeight: 700,
              color: C.primary,
              textShadow: `0 0 15px ${C.primary}30`,
            }}
          >
            🎵 Soltá los archivos acá
          </p>
        </div>
      )}

      {/* Header */}
      <div
        style={{
          padding: "20px 24px",
          borderBottom: `1px solid ${C.border}`,
          background: `linear-gradient(135deg, ${C.surface}cc, ${C.surface2}cc)`,
          backdropFilter: "blur(10px)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 16,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 28, textShadow: `0 0 8px ${C.primary}25` }}>
              🎧
            </span>
            <span
              style={{
                fontWeight: 900,
                fontSize: 28,
                letterSpacing: "-1px",
                background: `linear-gradient(135deg, ${C.primary}, ${C.secondary})`,
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              chill.
            </span>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              onClick={() => setMiniMode(true)}
              style={{
                background: `linear-gradient(135deg, ${C.primary}25, ${C.secondary}25)`,
                color: C.secondary,
                border: `1px solid ${C.primary}50`,
                padding: "8px 14px",
                borderRadius: 12,
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 600,
                transition: "all 0.3s ease",
              }}
            >
              🪟 Modo Mini
            </button>
            <label
              style={{
                background: `linear-gradient(135deg, ${C.primary}25, ${C.secondary}25)`,
                color: C.secondary,
                padding: "8px 14px",
                borderRadius: 12,
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 600,
                border: `1px solid ${C.primary}50`,
                display: "flex",
                alignItems: "center",
                gap: 6,
                transition: "all 0.3s ease",
              }}
            >
              <span style={{ fontSize: 14 }}>+</span> Agregar
              <input
                type="file"
                accept="audio/*"
                multiple
                style={{ display: "none" }}
                onChange={(e) => loadFiles(e.target.files)}
              />
            </label>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 2, borderBottom: `1px solid ${C.border}` }}>
          {[
            ["library", "🎵 Biblioteca"],
            ["lyrics", "📝 Letras"],
            ["playlists", "🎼 Playlists"],
            ["history", "⏱️ Historial"],
            ["eq", "🎚️ Ecualizador"],
          ].map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              style={{
                background: tab === id ? C.surface2 : "transparent",
                color: tab === id ? C.secondary : C.textMuted,
                border: "none",
                padding: "12px 16px",
                borderRadius: "8px 8px 0 0",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: tab === id ? 700 : 500,
                borderBottom: tab === id ? `3px solid ${C.secondary}` : "3px solid transparent",
                transition: "all 0.3s ease",
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
        {tab === "library" && (
          <div>
            {songs.length > 0 && (
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="🔍 Buscar canción o artista..."
                style={{
                  width: "100%",
                  background: C.surface2,
                  color: C.text,
                  border: `1px solid ${C.primary}30`,
                  borderRadius: 12,
                  padding: "10px 14px",
                  fontSize: 13,
                  outline: "none",
                  fontFamily: "inherit",
                  marginBottom: 12,
                }}
              />
            )}
            {songs.length === 0 ? (
              <div style={{ textAlign: "center", padding: "100px 20px", color: C.textMuted }}>
                <div style={{ fontSize: 64, marginBottom: 16, opacity: 0.5 }}>🎧</div>
                <p style={{ margin: 0, fontSize: 16, lineHeight: 1.7, fontWeight: 500 }}>
                  Arrastrá archivos de música acá
                  <br />
                  o usá el botón "Agregar"
                </p>
                <p style={{ margin: "12px 0 0", fontSize: 12, color: C.border }}>
                  Soporta MP3, FLAC, WAV, OGG y más
                </p>
              </div>
            ) : (
              <div>
                <p
                  style={{
                    fontSize: 12,
                    color: C.textMuted,
                    margin: "0 0 12px 4px",
                  }}
                >
                  {filteredSongs.length} de {songs.length} canciones
                </p>
                {filteredSongs.map((song, i) => {
                  const realIdx = songs.indexOf(song);
                  return (
                    <div
                      key={song.id}
                      onClick={() => playSong(realIdx)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "12px 14px",
                        borderRadius: 12,
                        marginBottom: 6,
                        background:
                          current === realIdx
                            ? `linear-gradient(135deg, ${C.primary}15, ${C.secondary}15)`
                            : "transparent",
                        cursor: "pointer",
                        borderLeft: `4px solid ${
                          current === realIdx ? C.secondary : "transparent"
                        }`,
                        transition: "all 0.2s ease",
                      }}
                    >
                      <Avatar title={song.title} size={40} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontWeight: current === realIdx ? 700 : 500,
                            fontSize: 14,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            color: current === realIdx ? C.secondary : C.text,
                          }}
                        >
                          {song.title}
                        </div>
                        <div
                          style={{
                            fontSize: 12,
                            color: C.textMuted,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {song.artist || "Artista desconocido"}
                        </div>
                      </div>
                      {current === realIdx && playing && (
                        <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 18 }}>
                          {[1, 2, 3].map((k) => (
                            <div
                              key={k}
                              style={{
                                width: 3,
                                borderRadius: 2,
                                background: `linear-gradient(135deg, ${C.primary}, ${C.secondary})`,
                                animation: `bounce${k} 0.7s ease-in-out infinite`,
                                height: `${10 + k * 4}px`,
                              }}
                            />
                          ))}
                        </div>
                      )}
                      {playlists.length > 0 && (
                        <select
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => {
                            if (e.target.value) addToPL(Number(e.target.value), song.id);
                            e.target.value = "";
                          }}
                          style={{
                            background: C.surface3,
                            color: C.secondary,
                            border: `1px solid ${C.primary}30`,
                            borderRadius: 8,
                            fontSize: 11,
                            padding: "5px 8px",
                            cursor: "pointer",
                          }}
                          defaultValue=""
                        >
                          <option value="" disabled>
                            + PL
                          </option>
                          {playlists.map((pl) => (
                            <option key={pl.id} value={pl.id}>
                              {pl.name}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {tab === "lyrics" && (
          <div style={{ maxWidth: 600, margin: "0 auto" }}>
            {current === null ? (
              <div style={{ textAlign: "center", padding: "100px 20px", color: C.textMuted }}>
                <div style={{ fontSize: 56, marginBottom: 12, opacity: 0.5 }}>📝</div>
                <p>Reproducí una canción para ver sus letras</p>
              </div>
            ) : (
              <div>
                <div
                  style={{
                    marginBottom: 20,
                    padding: "16px 18px",
                    background: `linear-gradient(135deg, ${C.surface2}dd, ${C.surface3}dd)`,
                    borderRadius: 14,
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    border: `1px solid ${C.primary}30`,
                  }}
                >
                  <Avatar title={currentSong.title} size={52} />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 16, color: C.secondary }}>
                      {currentSong.title}
                    </div>
                    <div style={{ color: C.textMuted, fontSize: 13 }}>
                      {currentSong.artist || "Artista desconocido"}
                    </div>
                  </div>
                </div>
                {lyricsStatus === "loading" && (
                  <div
                    style={{
                      color: C.textMuted,
                      fontSize: 14,
                      textAlign: "center",
                      padding: "60px 0",
                    }}
                  >
                    ⏳ Buscando letras...
                  </div>
                )}
                {(lyricsStatus === "found" || lyricsStatus === "notfound") && (
                  <pre
                    style={{
                      whiteSpace: "pre-wrap",
                      fontFamily: "inherit",
                      fontSize: 14,
                      lineHeight: 1.8,
                      color: lyricsStatus === "found" ? C.text : C.textMuted,
                      margin: "0 0 16px",
                      background: C.surface2,
                      padding: 16,
                      borderRadius: 12,
                      border: `1px solid ${C.border}`,
                    }}
                  >
                    {lyrics}
                  </pre>
                )}
                <button
                  onClick={fetchLyrics}
                  style={{
                    background: `linear-gradient(135deg, ${C.primary}25, ${C.secondary}25)`,
                    color: C.secondary,
                    border: `1px solid ${C.primary}30`,
                    borderRadius: 10,
                    padding: "10px 16px",
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: 600,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  🔄 Buscar de nuevo
                </button>
              </div>
            )}
          </div>
        )}

        {tab === "playlists" && (
          <div>
            <div style={{ display: "flex", gap: 10, marginBottom: 18 }}>
              <input
                value={newPLName}
                onChange={(e) => setNewPLName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && createPL()}
                placeholder="Nombre de la playlist..."
                style={{
                  flex: 1,
                  background: C.surface2,
                  color: C.text,
                  border: `1px solid ${C.primary}30`,
                  borderRadius: 12,
                  padding: "10px 14px",
                  fontSize: 13,
                  outline: "none",
                  fontFamily: "inherit",
                }}
              />
              <button
                onClick={createPL}
                style={{
                  background: `linear-gradient(135deg, ${C.primary}, ${C.accent})`,
                  color: "#fff",
                  border: "none",
                  borderRadius: 12,
                  padding: "10px 20px",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 700,
                  boxShadow: `0 0 10px ${C.primary}35`,
                }}
              >
                ➕ Crear
              </button>
            </div>
            {playlists.length === 0 ? (
              <div style={{ textAlign: "center", padding: "80px 20px", color: C.textMuted }}>
                <div style={{ fontSize: 56, marginBottom: 12, opacity: 0.5 }}>🎼</div>
                <p>Creá tu primera playlist</p>
              </div>
            ) : (
              <div style={{ display: "grid", gap: 14 }}>
                {playlists.map((pl) => {
                  const plSongs = songs.filter((s) => pl.songIds.includes(s.id));
                  return (
                    <div
                      key={pl.id}
                      style={{
                        background: `linear-gradient(135deg, ${C.surface}dd, ${C.surface2}dd)`,
                        borderRadius: 16,
                        padding: 18,
                        border: `1px solid ${C.primary}30`,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginBottom: plSongs.length > 0 ? 14 : 0,
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 15, color: C.secondary }}>
                            {pl.name}
                          </div>
                          <div style={{ fontSize: 12, color: C.textMuted }}>
                            {plSongs.length} canción{plSongs.length !== 1 ? "es" : ""}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          {plSongs.length > 0 && (
                            <button
                              onClick={() => playSong(songs.indexOf(plSongs[0]))}
                              style={{
                                background: `linear-gradient(135deg, ${C.primary}, ${C.accent})`,
                                color: "#fff",
                                border: "none",
                                borderRadius: 20,
                                padding: "7px 16px",
                                cursor: "pointer",
                                fontSize: 12,
                                fontWeight: 600,
                              }}
                            >
                              ▶ Play
                            </button>
                          )}
                          <button
                            onClick={() => deletePL(pl.id)}
                            style={{
                              background: C.surface3,
                              color: C.error,
                              border: `1px solid ${C.error}40`,
                              borderRadius: 20,
                              padding: "7px 12px",
                              cursor: "pointer",
                              fontSize: 12,
                              fontWeight: 600,
                            }}
                          >
                            🗑️ Borrar
                          </button>
                        </div>
                      </div>
                      {plSongs.map((s) => (
                        <div
                          key={s.id}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            padding: "10px 0",
                            borderTop: `1px solid ${C.border}`,
                          }}
                        >
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <span style={{ fontSize: 13, color: C.text }}>{s.title}</span>
                            {s.artist && (
                              <span style={{ fontSize: 11, color: C.textMuted, marginLeft: 10 }}>
                                {s.artist}
                              </span>
                            )}
                          </div>
                          <button
                            onClick={() => removeFromPL(pl.id, s.id)}
                            style={{
                              background: "transparent",
                              color: C.error,
                              border: "none",
                              cursor: "pointer",
                              fontSize: 18,
                              padding: "0 6px",
                              flexShrink: 0,
                            }}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {tab === "history" && (
          <div>
            {history.length === 0 ? (
              <div style={{ textAlign: "center", padding: "100px 20px", color: C.textMuted }}>
                <div style={{ fontSize: 56, marginBottom: 12, opacity: 0.5 }}>⏱️</div>
                <p>Aún no has reproducido canciones</p>
              </div>
            ) : (
              <div>
                <p
                  style={{
                    fontSize: 12,
                    color: C.textMuted,
                    margin: "0 0 12px 4px",
                  }}
                >
                  {history.length} canciones reproducidas
                </p>
                {history.map((songId) => {
                  const song = songs.find((s) => s.id === songId);
                  if (!song) return null;
                  const realIdx = songs.indexOf(song);
                  return (
                    <div
                      key={songId}
                      onClick={() => playSong(realIdx)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "12px 14px",
                        borderRadius: 12,
                        marginBottom: 6,
                        background:
                          current === realIdx
                            ? `linear-gradient(135deg, ${C.primary}15, ${C.secondary}15)`
                            : "transparent",
                        cursor: "pointer",
                        transition: "all 0.2s ease",
                      }}
                    >
                      <Avatar title={song.title} size={40} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontWeight: current === realIdx ? 700 : 500,
                            fontSize: 14,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            color: current === realIdx ? C.secondary : C.text,
                          }}
                        >
                          {song.title}
                        </div>
                        <div
                          style={{
                            fontSize: 12,
                            color: C.textMuted,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {song.artist || "Artista desconocido"}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {tab === "eq" && (
          <div style={{ maxWidth: 500, margin: "0 auto" }}>
            <div
              style={{
                background: `linear-gradient(135deg, ${C.surface}dd, ${C.surface2}dd)`,
                borderRadius: 16,
                padding: 20,
                border: `1px solid ${C.primary}30`,
              }}
            >
              <p
                style={{
                  fontSize: 14,
                  color: C.textMuted,
                  marginBottom: 20,
                  textAlign: "center",
                }}
              >
                🎚️ Ajusta los niveles de frecuencia
              </p>
              {["60Hz", "250Hz", "1KHz", "4KHz", "12KHz"].map((label, i) => (
                <div key={i} style={{ marginBottom: 20 }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginBottom: 8,
                    }}
                  >
                    <span style={{ fontSize: 12, fontWeight: 600, color: C.secondary }}>
                      {label}
                    </span>
                    <span style={{ fontSize: 11, color: C.textMuted }}>
                      {eq[i] > 0 ? "+" : ""}{eq[i].toFixed(1)} dB
                    </span>
                  </div>
                  <input
                    type="range"
                    min={-12}
                    max={12}
                    step={0.1}
                    value={eq[i]}
                    onChange={(e) => {
                      const newEq = [...eq];
                      newEq[i] = +e.target.value;
                      setEq(newEq);
                    }}
                    style={{
                      width: "100%",
                      accentColor: C.secondary,
                      cursor: "pointer",
                    }}
                  />
                </div>
              ))}
              <button
                onClick={() => setEq([0, 0, 0, 0, 0])}
                style={{
                  width: "100%",
                  background: C.surface3,
                  color: C.secondary,
                  border: `1px solid ${C.primary}30`,
                  borderRadius: 10,
                  padding: "10px",
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 600,
                  marginTop: 16,
                }}
              >
                ↺ Resetear
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Visualizer */}
      <div
        style={{
          height: 80,
          padding: "12px 12px 0",
          display: "flex",
          alignItems: "flex-end",
          gap: 2,
          background: `linear-gradient(180deg, ${C.bg}00, ${C.bg}ff)`,
          overflow: "hidden",
        }}
      >
        {bars.map((h, i) => {
          const t = i / bars.length;
          const r = Math.round(124 + (185 - 124) * t);
          const g = Math.round(92 + (170 - 92) * t);
          const b = Math.round(255 + (255 - 255) * t);
          return (
            <div
              key={i}
              style={{
                flex: 1,
                height: `${h}px`,
                background: `rgb(${r},${g},${b})`,
                borderRadius: "3px 3px 0 0",
                opacity: playing ? 0.7 : 0.15,
                transition: "height 0.1s ease, opacity 0.3s",
                boxShadow: `0 0 6px rgba(${r},${g},${b},0.35)`,
              }}
            />
          );
        })}
      </div>

      {/* Player */}
      <div
        style={{
          background: `linear-gradient(135deg, ${C.surface}dd, ${C.surface2}dd)`,
          borderTop: `1px solid ${C.primary}30`,
          padding: "14px 18px 18px",
          backdropFilter: "blur(10px)",
        }}
      >
        {currentSong && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginBottom: 10,
            }}
          >
            <Avatar title={currentSong.title} size={40} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  color: C.secondary,
                }}
              >
                {currentSong.title}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: C.textMuted,
                }}
              >
                {currentSong.artist || "Artista desconocido"}
              </div>
            </div>
          </div>
        )}

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 12,
          }}
        >
          <span style={{ fontSize: 11, color: C.textMuted, minWidth: 40 }}>
            {fmt(progress)}
          </span>
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={progress}
            onChange={(e) => {
              audioRef.current.currentTime = +e.target.value;
              setProgress(+e.target.value);
            }}
            style={{
              flex: 1,
              accentColor: C.secondary,
              cursor: "pointer",
            }}
          />
          <span style={{ fontSize: 11, color: C.textMuted, minWidth: 40 }}>
            {fmt(duration)}
          </span>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6, position: "relative" }}>
            <span style={{ fontSize: 13, color: C.textMuted }}>🔊</span>
            <div style={{ position: "relative", width: 80 }}>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={volume}
                onChange={handleVolumeChange}
                style={{
                  width: "100%",
                  accentColor: C.secondary,
                  cursor: "pointer",
                }}
              />
              {volumeShowFeedback && (
                <div
                  style={{
                    position: "absolute",
                    top: -28,
                    left: "50%",
                    transform: "translateX(-50%)",
                    background: C.primary,
                    color: "#fff",
                    padding: "4px 8px",
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: 600,
                    whiteSpace: "nowrap",
                    animation: "ch-fade-in 0.2s ease-out, ch-fade-out 0.2s ease-out 1.3s forwards",
                  }}
                >
                  {Math.round(volume * 100)}%
                </div>
              )}
            </div>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <button onClick={() => setShuffle((s) => !s)} style={iconBtn(shuffle)} title="Aleatorio">
              🔀
            </button>
            <button onClick={prevSong} style={{ ...iconBtn(false), fontSize: 20 }}>
              ⏮
            </button>
            <button
              onClick={togglePlay}
              style={{
                background: `linear-gradient(135deg, ${C.primary}, ${C.accent})`,
                border: "none",
                color: "#fff",
                width: 56,
                height: 56,
                borderRadius: "50%",
                cursor: "pointer",
                fontSize: 22,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: `0 0 15px ${C.primary}35`,
                transition: "all 0.3s ease",
              }}
            >
              {playing ? "⏸" : "▶"}
            </button>
            <button onClick={nextSong} style={{ ...iconBtn(false), fontSize: 20 }}>
              ⏭
            </button>
            <button onClick={() => setRepeat((r) => !r)} style={iconBtn(repeat)} title="Repetir">
              🔁
            </button>
          </div>
          <div style={{ width: 100 }} />
        </div>
      </div>

      <style>{`
        @keyframes bounce1 { 0%,100%{height:12px} 50%{height:20px} }
        @keyframes bounce2 { 0%,100%{height:16px} 50%{height:6px} }
        @keyframes bounce3 { 0%,100%{height:14px} 50%{height:22px} }
        @keyframes ch-fade-in { 0%{opacity:0;transform:translateX(-50%) translateY(4px)} 100%{opacity:1;transform:translateX(-50%) translateY(0)} }
        @keyframes ch-fade-out { 0%{opacity:1;transform:translateX(-50%) translateY(0)} 100%{opacity:0;transform:translateX(-50%) translateY(-4px)} }
        input[type=range]{height:5px}
        input[type=range]::-webkit-slider-thumb{width:14px;height:14px;border-radius:50%;}
        ::-webkit-scrollbar{width:6px}
        ::-webkit-scrollbar-track{background:transparent}
        ::-webkit-scrollbar-thumb{background:${C.primary}50;border-radius:4px}
      `}</style>
    </div>
  );
}
