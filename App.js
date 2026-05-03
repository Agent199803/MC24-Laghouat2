import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  Vibration,
  PanResponder
} from "react-native";
import TcpSocket from "react-native-tcp-socket";

const PORT = 2424;
const FIELD_W = 760;
const FIELD_H = 430;
const PLAYER = 48;
const BALL = 28;
const TEAM_A = "#e53935";
const TEAM_B = "#1e88e5";

export default function App() {
  const [screen, setScreen] = useState("menu");
  const [isHost, setIsHost] = useState(false);
  const [status, setStatus] = useState("Offline");

  const [roomName, setRoomName] = useState("MC24 Room");
  const [playerName, setPlayerName] = useState("Player");
  const [team, setTeam] = useState("A");
  const [teamAName, setTeamAName] = useState("MC24");
  const [teamBName, setTeamBName] = useState("Guest");
  const [hostIp, setHostIp] = useState("");

  const [scoreA, setScoreA] = useState(0);
  const [scoreB, setScoreB] = useState(0);
  const [ping, setPing] = useState(0);
  const [goalFlash, setGoalFlash] = useState("");
  const [netShake, setNetShake] = useState(0);

  const [players, setPlayers] = useState({});
  const [me, setMe] = useState({
    id: String(Date.now()),
    name: "Player",
    team: "A",
    x: 120,
    y: 210,
    vx: 0,
    vy: 0
  });

  const [ball, setBall] = useState({
    x: 370,
    y: 210,
    vx: 0,
    vy: 0,
    spin: 0
  });

  const [joy, setJoy] = useState({ x: 0, y: 0 });

  const serverRef = useRef(null);
  const clientsRef = useRef([]);
  const socketRef = useRef(null);
  const playersRef = useRef(players);
  const ballRef = useRef(ball);
  const meRef = useRef(me);
  const bufferRef = useRef({});
  const lastPingRef = useRef(0);

  useEffect(() => { playersRef.current = players; }, [players]);
  useEffect(() => { ballRef.current = ball; }, [ball]);
  useEffect(() => { meRef.current = me; }, [me]);

  function colorOf(t) {
    return t === "A" ? TEAM_A : TEAM_B;
  }

  function effect(type) {
    if (type === "kick") Vibration.vibrate(25);
    if (type === "goal") Vibration.vibrate([0, 90, 50, 120]);
  }

  function sendAll(data) {
    const msg = JSON.stringify(data) + "\n";
    clientsRef.current.forEach(s => {
      try { s.write(msg); } catch {}
    });
  }

  function sendHost(data) {
    if (!socketRef.current) return;
    try { socketRef.current.write(JSON.stringify(data) + "\n"); } catch {}
  }

  function broadcast(ballData, a, b, p = playersRef.current) {
    sendAll({
      type: "state",
      t: Date.now(),
      roomName,
      ball: ballData,
      scoreA: a,
      scoreB: b,
      players: p,
      teamAName,
      teamBName
    });
  }

  function startHost() {
    try {
      const start = team === "A" ? 120 : 620;
      const mine = { ...meRef.current, name: playerName, team, x: start, y: 210 };
      const ai = {
        id: "AI_BOT",
        name: "AI",
        team: team === "A" ? "B" : "A",
        x: team === "A" ? 620 : 120,
        y: 210,
        vx: 0,
        vy: 0,
        ai: true
      };

      const initial = { [mine.id]: mine, AI_BOT: ai };
      setIsHost(true);
      setMe(mine);
      setPlayers(initial);

      const server = TcpSocket.createServer(socket => {
        clientsRef.current.push(socket);

        socket.on("data", data => {
          data.toString().split("\n").filter(Boolean).forEach(raw => {
            try {
              const msg = JSON.parse(raw);

              if (msg.type === "join" || msg.type === "move") {
                setPlayers(prev => {
                  const updated = { ...prev, [msg.player.id]: msg.player };
                  playersRef.current = updated;
                  broadcast(ballRef.current, scoreA, scoreB, updated);
                  return updated;
                });
              }

              if (msg.type === "kick") {
                const p = msg.player;
                const b = ballRef.current;
                const dx = b.x - p.x;
                const dy = b.y - p.y;
                const d = Math.sqrt(dx * dx + dy * dy) || 1;
                if (d < 95) {
                  const kicked = {
                    ...b,
                    vx: (dx / d) * 16,
                    vy: (dy / d) * 16,
                    spin: Math.max(-5, Math.min(5, (p.vx || 0) * 0.7))
                  };
                  setBall(kicked);
                  ballRef.current = kicked;
                  effect("kick");
                  broadcast(kicked, scoreA, scoreB);
                }
              }

              if (msg.type === "ping") {
                socket.write(JSON.stringify({ type: "pong", t: msg.t }) + "\n");
              }
            } catch {}
          });
        });

        socket.on("close", () => {
          clientsRef.current = clientsRef.current.filter(s => s !== socket);
        });
      });

      server.listen({ port: PORT, host: "0.0.0.0" }, () => {
        setStatus("HOST | Port " + PORT);
        setScreen("game");
      });

      serverRef.current = server;
    } catch (e) {
      Alert.alert("Host error", String(e));
    }
  }

  function joinHost() {
    try {
      const start = team === "A" ? 160 : 600;
      const mine = { ...meRef.current, name: playerName, team, x: start, y: 210 };

      setIsHost(false);
      setMe(mine);

      const socket = TcpSocket.createConnection({ port: PORT, host: hostIp }, () => {
        socketRef.current = socket;
        setStatus("Connected");
        setScreen("game");
        sendHost({ type: "join", player: mine });
      });

      socket.on("data", data => {
        data.toString().split("\n").filter(Boolean).forEach(raw => {
          try {
            const msg = JSON.parse(raw);

            if (msg.type === "state") {
              setBall(msg.ball);
              setScoreA(msg.scoreA);
              setScoreB(msg.scoreB);
              if (msg.teamAName) setTeamAName(msg.teamAName);
              if (msg.teamBName) setTeamBName(msg.teamBName);

              Object.values(msg.players || {}).forEach(p => {
                if (p.id === meRef.current.id) return;
                if (!bufferRef.current[p.id]) bufferRef.current[p.id] = [];
                bufferRef.current[p.id].push({ ...p, t: Date.now() });
                if (bufferRef.current[p.id].length > 5) bufferRef.current[p.id].shift();
              });

              setPlayers(prev => ({ ...prev, ...msg.players }));
            }

            if (msg.type === "pong") {
              setPing(Date.now() - msg.t);
            }
          } catch {}
        });
      });

      socket.on("error", e => Alert.alert("Connection error", String(e)));
    } catch (e) {
      Alert.alert("Join error", String(e));
    }
  }

  function playerBallCollision(p, b) {
    const dx = b.x - p.x;
    const dy = b.y - p.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;

    if (d < 56) {
      const nx = dx / d;
      const ny = dy / d;
      return {
        ...b,
        x: p.x + nx * 56,
        y: p.y + ny * 56,
        vx: nx * 9.8 + (p.vx || 0) * 0.35,
        vy: ny * 9.8 + (p.vy || 0) * 0.35,
        spin: Math.max(-6, Math.min(6, (p.vx || 0) * 0.45))
      };
    }
    return b;
  }

  function moveAI(map, b) {
    const ai = map.AI_BOT;
    if (!ai) return map;

    const dx = b.x - ai.x;
    const dy = b.y - ai.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    const speed = 4.6;

    const next = {
      ...ai,
      vx: (dx / d) * speed,
      vy: (dy / d) * speed,
      x: Math.max(10, Math.min(FIELD_W - 60, ai.x + (dx / d) * speed)),
      y: Math.max(60, Math.min(FIELD_H - 60, ai.y + (dy / d) * speed))
    };

    return { ...map, AI_BOT: next };
  }

  function goal(text) {
    setGoalFlash(text);
    setNetShake(1);
    effect("goal");
    setTimeout(() => setNetShake(0), 450);
    setTimeout(() => setGoalFlash(""), 1300);
  }

  useEffect(() => {
    if (screen !== "game" || !isHost) return;

    const loop = setInterval(() => {
      let pMap = moveAI(playersRef.current, ballRef.current);
      setPlayers(pMap);
      playersRef.current = pMap;

      let b = ballRef.current;

      b = {
        x: b.x + b.vx,
        y: b.y + b.vy + b.spin * 0.08,
        vx: b.vx * 0.995,
        vy: b.vy * 0.995,
        spin: b.spin * 0.985
      };

      Object.values(pMap).forEach(p => {
        b = playerBallCollision(p, b);
      });

      if (b.y < 45) {
        b.y = 45;
        b.vy *= -1;
        b.spin *= 0.8;
      }

      if (b.y > FIELD_H - BALL) {
        b.y = FIELD_H - BALL;
        b.vy *= -1;
        b.spin *= 0.8;
      }

      if (b.x < -5) {
        const ns = scoreB + 1;
        const reset = { x: 370, y: 210, vx: 0, vy: 0, spin: 0 };
        setScoreB(ns);
        setBall(reset);
        ballRef.current = reset;
        broadcast(reset, scoreA, ns, pMap);
        goal("GOAL " + teamBName);
        return;
      }

      if (b.x > FIELD_W + 5) {
        const ns = scoreA + 1;
        const reset = { x: 370, y: 210, vx: 0, vy: 0, spin: 0 };
        setScoreA(ns);
        setBall(reset);
        ballRef.current = reset;
        broadcast(reset, ns, scoreB, pMap);
        goal("GOAL " + teamAName);
        return;
      }

      setBall(b);
      ballRef.current = b;
      broadcast(b, scoreA, scoreB, pMap);
    }, 16);

    return () => clearInterval(loop);
  }, [screen, isHost, scoreA, scoreB]);

  useEffect(() => {
    if (screen !== "game" || isHost) return;

    const loop = setInterval(() => {
      const now = Date.now();
      if (now - lastPingRef.current > 1200) {
        lastPingRef.current = now;
        sendHost({ type: "ping", t: now });
      }
    }, 200);

    return () => clearInterval(loop);
  }, [screen, isHost]);

  useEffect(() => {
    if (screen !== "game") return;

    const loop = setInterval(() => {
      const cur = meRef.current;
      const speed = 6.8;

      if (Math.abs(joy.x) < 0.05 && Math.abs(joy.y) < 0.05) return;

      const next = {
        ...cur,
        name: playerName,
        team,
        vx: joy.x * speed,
        vy: joy.y * speed,
        x: Math.max(10, Math.min(FIELD_W - 60, cur.x + joy.x * speed)),
        y: Math.max(60, Math.min(FIELD_H - 60, cur.y + joy.y * speed))
      };

      setMe(next);
      meRef.current = next;

      setPlayers(prev => {
        const updated = { ...prev, [next.id]: next };
        playersRef.current = updated;
        return updated;
      });

      if (isHost) {
        broadcast(ballRef.current, scoreA, scoreB, {
          ...playersRef.current,
          [next.id]: next
        });
      } else {
        sendHost({ type: "move", player: next });
      }
    }, 16);

    return () => clearInterval(loop);
  }, [screen, joy, isHost, scoreA, scoreB, playerName, team]);

  const joyResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (_, g) => updateJoy(g.dx, g.dy),
      onPanResponderMove: (_, g) => updateJoy(g.dx, g.dy),
      onPanResponderRelease: () => setJoy({ x: 0, y: 0 })
    })
  ).current;

  function updateJoy(dx, dy) {
    const max = 45;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    const m = Math.min(1, d / max);
    setJoy({
      x: (dx / d) * m,
      y: (dy / d) * m
    });
  }

  function kick() {
    const p = meRef.current;
    const b = ballRef.current;
    const dx = b.x - p.x;
    const dy = b.y - p.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;

    if (d > 95) return;

    const kicked = {
      ...b,
      vx: (dx / d) * 17 + p.vx * 0.3,
      vy: (dy / d) * 17 + p.vy * 0.3,
      spin: Math.max(-7, Math.min(7, p.vx * 0.55))
    };

    effect("kick");

    if (isHost) {
      setBall(kicked);
      ballRef.current = kicked;
      broadcast(kicked, scoreA, scoreB);
    } else {
      sendHost({ type: "kick", player: p });
    }
  }

  if (screen === "menu") {
    return (
      <View style={styles.menu}>
        <Text style={styles.title}>MC24 Laghouat PRO</Text>

        <TextInput style={styles.input} value={roomName} onChangeText={setRoomName} placeholder="Room name" />
        <TextInput style={styles.input} value={playerName} onChangeText={setPlayerName} placeholder="Player name" />
        <TextInput style={styles.input} value={teamAName} onChangeText={setTeamAName} placeholder="Team A name" />
        <TextInput style={styles.input} value={teamBName} onChangeText={setTeamBName} placeholder="Team B name" />

        <View style={styles.row}>
          <TouchableOpacity style={[styles.teamBtn, team === "A" && styles.a]} onPress={() => setTeam("A")}>
            <Text style={styles.btnText}>TEAM A</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.teamBtn, team === "B" && styles.b]} onPress={() => setTeam("B")}>
            <Text style={styles.btnText}>TEAM B</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.button} onPress={startHost}>
          <Text style={styles.btnText}>Create Room</Text>
        </TouchableOpacity>

        <TextInput style={styles.input} value={hostIp} onChangeText={setHostIp} placeholder="Host IP مثل 192.168.43.1" />

        <TouchableOpacity style={styles.button} onPress={joinHost}>
          <Text style={styles.btnText}>Join Room</Text>
        </TouchableOpacity>

        <Text style={styles.status}>{status}</Text>
      </View>
    );
  }

  return (
    <View style={styles.field}>
      <Text style={styles.score}>
        {roomName} | {teamAName} {scoreA} - {scoreB} {teamBName}
      </Text>

      <Text style={styles.ping}>{isHost ? "HOST" : `PING ${ping}ms`}</Text>

      <View style={styles.centerLine} />
      <View style={styles.centerCircle} />
      <View style={[styles.goalLeft, netShake ? styles.netShake : null]} />
      <View style={[styles.goalRight, netShake ? styles.netShake : null]} />

      <View style={[styles.ball, { left: ball.x, top: ball.y, transform: [{ rotate: `${ball.spin * 12}deg` }] }]} />

      {Object.values(players).map(p => (
        <View
          key={p.id}
          style={[
            styles.player,
            {
              left: p.x,
              top: p.y,
              backgroundColor: colorOf(p.team),
              opacity: p.ai ? 0.72 : 1
            }
          ]}
        >
          <Text style={styles.playerText}>{(p.name || "P").slice(0, 2).toUpperCase()}</Text>
        </View>
      ))}

      {goalFlash !== "" && (
        <View style={styles.goalFlash}>
          <Text style={styles.goalText}>{goalFlash}</Text>
        </View>
      )}

      <View style={styles.joyBase} {...joyResponder.panHandlers}>
        <View
          style={[
            styles.joyStick,
            { left: 42 + joy.x * 32, top: 42 + joy.y * 32 }
          ]}
        />
      </View>

      <TouchableOpacity style={styles.kick} onPress={kick}>
        <Text style={styles.kickText}>KICK</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.back} onPress={() => setScreen("menu")}>
        <Text style={styles.btnText}>Menu</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  menu: { flex: 1, backgroundColor: "#123f25", justifyContent: "center", alignItems: "center" },
  title: { color: "white", fontSize: 36, fontWeight: "bold", marginBottom: 10 },
  input: { width: 290, backgroundColor: "white", padding: 10, borderRadius: 12, marginVertical: 4 },
  row: { flexDirection: "row", marginVertical: 6 },
  teamBtn: { width: 135, backgroundColor: "#111", padding: 12, borderRadius: 14, alignItems: "center", marginHorizontal: 5 },
  a: { backgroundColor: TEAM_A },
  b: { backgroundColor: TEAM_B },
  button: { width: 290, backgroundColor: "#111", padding: 13, borderRadius: 14, alignItems: "center", marginTop: 6 },
  btnText: { color: "white", fontWeight: "bold" },
  status: { color: "white", marginTop: 8 },
  field: { flex: 1, backgroundColor: "#1f7a3d", borderWidth: 4, borderColor: "white" },
  score: { position: "absolute", top: 10, alignSelf: "center", color: "white", fontSize: 18, fontWeight: "bold", zIndex: 20, backgroundColor: "rgba(0,0,0,.4)", paddingHorizontal: 16, paddingVertical: 5, borderRadius: 10 },
  ping: { position: "absolute", top: 12, left: 12, color: "white", fontWeight: "bold", zIndex: 20, backgroundColor: "rgba(0,0,0,.45)", padding: 8, borderRadius: 8 },
  centerLine: { position: "absolute", left: "50%", top: 0, bottom: 0, width: 2, backgroundColor: "white", opacity: .8 },
  centerCircle: { position: "absolute", left: "50%", top: "50%", width: 130, height: 130, marginLeft: -65, marginTop: -65, borderRadius: 65, borderWidth: 2, borderColor: "white", opacity: .8 },
  goalLeft: { position: "absolute", left: 0, top: "35%", width: 16, height: 130, backgroundColor: "white" },
  goalRight: { position: "absolute", right: 0, top: "35%", width: 16, height: 130, backgroundColor: "white" },
  netShake: { width: 24, opacity: .85 },
  ball: { position: "absolute", width: BALL, height: BALL, borderRadius: BALL / 2, backgroundColor: "white", borderWidth: 3, borderColor: "#111", zIndex: 5 },
  player: { position: "absolute", width: PLAYER, height: PLAYER, borderRadius: PLAYER / 2, borderWidth: 2, borderColor: "#111", alignItems: "center", justifyContent: "center", zIndex: 6 },
  playerText: { color: "#111", fontWeight: "bold" },
  goalFlash: { position: "absolute", top: "37%", alignSelf: "center", backgroundColor: "rgba(0,0,0,.75)", paddingHorizontal: 42, paddingVertical: 18, borderRadius: 18, zIndex: 50 },
  goalText: { color: "white", fontSize: 34, fontWeight: "bold" },
  joyBase: { position: "absolute", left: 22, bottom: 22, width: 120, height: 120, borderRadius: 60, backgroundColor: "rgba(0,0,0,.35)", borderWidth: 2, borderColor: "rgba(255,255,255,.45)", zIndex: 30 },
  joyStick: { position: "absolute", width: 36, height: 36, borderRadius: 18, backgroundColor: "white" },
  kick: { position: "absolute", right: 38, bottom: 35, width: 86, height: 86, borderRadius: 43, backgroundColor: "#fdd835", justifyContent: "center", alignItems: "center", zIndex: 30, borderWidth: 3, borderColor: "#111" },
  kickText: { color: "#111", fontWeight: "bold", fontSize: 16 },
  back: { position: "absolute", right: 10, top: 10, backgroundColor: "#111", padding: 9, borderRadius: 9, zIndex: 40 }
});
