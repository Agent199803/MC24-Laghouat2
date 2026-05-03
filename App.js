// MC24 Laghouat PRO Engine
// Host authoritative + prediction + smoothing + network tick + spin physics

import React, { useEffect, useRef, useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  Alert, Vibration, PanResponder
} from "react-native";
import TcpSocket from "react-native-tcp-socket";

const PORT = 2424;
const FW = 760, FH = 430;
const P = 48, B = 28;
const TEAM_A = "#e53935", TEAM_B = "#1e88e5";

const PHYSICS_DT = 16;      // 60 FPS
const NET_DT = 50;          // 20 Hz
const PLAYER_SPEED = 7.2;
const ACCEL = 0.32;
const FRICTION = 0.90;

export default function App() {
  const [screen, setScreen] = useState("menu");
  const [isHost, setIsHost] = useState(false);

  const [roomName, setRoomName] = useState("MC24 Room");
  const [playerName, setPlayerName] = useState("Player");
  const [team, setTeam] = useState("A");
  const [teamAName, setTeamAName] = useState("MC24");
  const [teamBName, setTeamBName] = useState("Guest");
  const [hostIp, setHostIp] = useState("");
  const [status, setStatus] = useState("Offline");

  const [scoreA, setScoreA] = useState(0);
  const [scoreB, setScoreB] = useState(0);
  const [ping, setPing] = useState(0);
  const [goalFlash, setGoalFlash] = useState("");

  const [joy, setJoy] = useState({ x: 0, y: 0 });
  const [renderPlayers, setRenderPlayers] = useState({});
  const [renderBall, setRenderBall] = useState({ x: 370, y: 210, vx: 0, vy: 0, spin: 0 });

  const socketRef = useRef(null);
  const serverRef = useRef(null);
  const clientsRef = useRef([]);

  const playersRef = useRef({});
  const ballRef = useRef({ x: 370, y: 210, vx: 0, vy: 0, spin: 0 });
  const scoresRef = useRef({ a: 0, b: 0 });
  const joyRef = useRef({ x: 0, y: 0 });
  const meIdRef = useRef(String(Date.now()));
  const isHostRef = useRef(false);
  const snapBufferRef = useRef([]);
  const pingTimeRef = useRef(0);

  useEffect(() => { joyRef.current = joy; }, [joy]);
  useEffect(() => { isHostRef.current = isHost; }, [isHost]);

  function c(t) { return t === "A" ? TEAM_A : TEAM_B; }
  function vibrateGoal() { Vibration.vibrate([0, 80, 40, 120]); }
  function vibrateKick() { Vibration.vibrate(25); }

  function write(socket, data) {
    try { socket.write(JSON.stringify(data) + "\n"); } catch {}
  }

  function sendAll(data) {
    clientsRef.current.forEach(s => write(s, data));
  }

  function sendHost(data) {
    if (socketRef.current) write(socketRef.current, data);
  }

  function snapshot() {
    return {
      type: "snapshot",
      t: Date.now(),
      roomName,
      teamAName,
      teamBName,
      players: playersRef.current,
      ball: ballRef.current,
      scoreA: scoresRef.current.a,
      scoreB: scoresRef.current.b
    };
  }

  function broadcastSnapshot() {
    sendAll(snapshot());
  }

  function resetBall() {
    ballRef.current = { x: 370, y: 210, vx: 0, vy: 0, spin: 0 };
  }

  function goal(side) {
    if (side === "A") {
      scoresRef.current.a += 1;
      setScoreA(scoresRef.current.a);
      setGoalFlash("GOAL " + teamAName);
    } else {
      scoresRef.current.b += 1;
      setScoreB(scoresRef.current.b);
      setGoalFlash("GOAL " + teamBName);
    }

    resetBall();
    vibrateGoal();
    broadcastSnapshot();
    setTimeout(() => setGoalFlash(""), 1200);
  }

  function startHost() {
    try {
      const id = meIdRef.current;
      const mine = {
        id,
        name: playerName,
        team,
        x: team === "A" ? 120 : 620,
        y: 210,
        vx: 0,
        vy: 0
      };

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

      playersRef.current = { [id]: mine, AI_BOT: ai };
      setRenderPlayers(playersRef.current);
      setIsHost(true);
      isHostRef.current = true;

      const server = TcpSocket.createServer(socket => {
        clientsRef.current.push(socket);

        socket.on("data", data => {
          data.toString().split("\n").filter(Boolean).forEach(raw => {
            try {
              const msg = JSON.parse(raw);

              if (msg.type === "join" || msg.type === "input") {
                playersRef.current[msg.player.id] = msg.player;
              }

              if (msg.type === "kick") {
                kickByPlayer(msg.player);
              }

              if (msg.type === "ping") {
                write(socket, { type: "pong", t: msg.t });
              }
            } catch {}
          });
        });

        socket.on("close", () => {
          clientsRef.current = clientsRef.current.filter(x => x !== socket);
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
      const id = meIdRef.current;
      const mine = {
        id,
        name: playerName,
        team,
        x: team === "A" ? 160 : 600,
        y: 210,
        vx: 0,
        vy: 0
      };

      playersRef.current = { [id]: mine };
      setRenderPlayers(playersRef.current);
      setIsHost(false);
      isHostRef.current = false;

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

            if (msg.type === "snapshot") {
              snapBufferRef.current.push(msg);
              if (snapBufferRef.current.length > 8) snapBufferRef.current.shift();

              setTeamAName(msg.teamAName || teamAName);
              setTeamBName(msg.teamBName || teamBName);
              setScoreA(msg.scoreA);
              setScoreB(msg.scoreB);
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

  function kickByPlayer(p) {
    const b = ballRef.current;
    const dx = b.x - p.x;
    const dy = b.y - p.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;

    if (d < 95) {
      ballRef.current = {
        ...b,
        vx: (dx / d) * 17 + (p.vx || 0) * 0.25,
        vy: (dy / d) * 17 + (p.vy || 0) * 0.25,
        spin: Math.max(-7, Math.min(7, (p.vx || 0) * 0.55))
      };
      vibrateKick();
    }
  }

  function collision(p, b) {
    const dx = b.x - p.x;
    const dy = b.y - p.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;

    if (d < 56) {
      const nx = dx / d, ny = dy / d;
      return {
        ...b,
        x: p.x + nx * 56,
        y: p.y + ny * 56,
        vx: nx * 10 + (p.vx || 0) * 0.35,
        vy: ny * 10 + (p.vy || 0) * 0.35,
        spin: Math.max(-6, Math.min(6, (p.vx || 0) * 0.45))
      };
    }
    return b;
  }

  function updateAI(map, ball) {
    const ai = map.AI_BOT;
    if (!ai) return map;

    const dx = ball.x - ai.x;
    const dy = ball.y - ai.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    const sp = 4.8;

    return {
      ...map,
      AI_BOT: {
        ...ai,
        vx: (dx / d) * sp,
        vy: (dy / d) * sp,
        x: Math.max(10, Math.min(FW - 60, ai.x + (dx / d) * sp)),
        y: Math.max(60, Math.min(FH - 60, ai.y + (dy / d) * sp))
      }
    };
  }

  useEffect(() => {
    if (screen !== "game") return;

    const physics = setInterval(() => {
      const id = meIdRef.current;
      const p = playersRef.current[id];

      if (p) {
        const j = joyRef.current;
        const targetVx = j.x * PLAYER_SPEED;
        const targetVy = j.y * PLAYER_SPEED;

        const nvx = p.vx + (targetVx - p.vx) * ACCEL;
        const nvy = p.vy + (targetVy - p.vy) * ACCEL;

        const next = {
          ...p,
          name: playerName,
          team,
          vx: nvx * FRICTION,
          vy: nvy * FRICTION,
          x: Math.max(10, Math.min(FW - 60, p.x + nvx)),
          y: Math.max(60, Math.min(FH - 60, p.y + nvy))
        };

        playersRef.current[id] = next;

        if (!isHostRef.current) {
          sendHost({ type: "input", player: next });
        }
      }

      if (isHostRef.current) {
        let map = updateAI(playersRef.current, ballRef.current);
        playersRef.current = map;

        let b = ballRef.current;
        b = {
          x: b.x + b.vx,
          y: b.y + b.vy + b.spin * 0.08,
          vx: b.vx * 0.995,
          vy: b.vy * 0.995,
          spin: b.spin * 0.985
        };

        Object.values(map).forEach(pl => { b = collision(pl, b); });

        if (b.y < 45) { b.y = 45; b.vy *= -1; b.spin *= 0.8; }
        if (b.y > FH - B) { b.y = FH - B; b.vy *= -1; b.spin *= 0.8; }

        if (b.x < -5) { goal("B"); return; }
        if (b.x > FW + 5) { goal("A"); return; }

        ballRef.current = b;
      } else {
        const latest = snapBufferRef.current[snapBufferRef.current.length - 1];
        if (latest) {
          const localMe = playersRef.current[id];
          playersRef.current = { ...latest.players, [id]: localMe };
          ballRef.current = latest.ball;
        }
      }

      setRenderPlayers({ ...playersRef.current });
      setRenderBall({ ...ballRef.current });
    }, PHYSICS_DT);

    const net = setInterval(() => {
      if (isHostRef.current) broadcastSnapshot();
      else {
        const now = Date.now();
        if (now - pingTimeRef.current > 1000) {
          pingTimeRef.current = now;
          sendHost({ type: "ping", t: now });
        }
      }
    }, NET_DT);

    return () => {
      clearInterval(physics);
      clearInterval(net);
    };
  }, [screen, playerName, team]);

  const joyResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (_, g) => setAnalog(g.dx, g.dy),
      onPanResponderMove: (_, g) => setAnalog(g.dx, g.dy),
      onPanResponderRelease: () => setJoy({ x: 0, y: 0 })
    })
  ).current;

  function setAnalog(dx, dy) {
    const max = 45;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    const m = Math.min(1, d / max);
    setJoy({ x: (dx / d) * m, y: (dy / d) * m });
  }

  function kick() {
    const p = playersRef.current[meIdRef.current];
    if (!p) return;

    if (isHostRef.current) kickByPlayer(p);
    else sendHost({ type: "kick", player: p });

    vibrateKick();
  }

  if (screen === "menu") {
    return (
      <View style={styles.menu}>
        <Text style={styles.title}>MC24 Laghouat ENGINE</Text>

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

      <Text style={styles.ping}>{isHost ? "HOST 20Hz" : `PING ${ping}ms`}</Text>

      <View style={styles.centerLine} />
      <View style={styles.centerCircle} />
      <View style={styles.goalLeft} />
      <View style={styles.goalRight} />

      <View style={[styles.ball, { left: renderBall.x, top: renderBall.y, transform: [{ rotate: `${renderBall.spin * 12}deg` }] }]} />

      {Object.values(renderPlayers).map(p => (
        <View key={p.id} style={[styles.player, { left: p.x, top: p.y, backgroundColor: c(p.team), opacity: p.ai ? 0.7 : 1 }]}>
          <Text style={styles.playerText}>{(p.name || "P").slice(0, 2).toUpperCase()}</Text>
        </View>
      ))}

      {goalFlash !== "" && (
        <View style={styles.goalFlash}>
          <Text style={styles.goalText}>{goalFlash}</Text>
        </View>
      )}

      <View style={styles.joyBase} {...joyResponder.panHandlers}>
        <View style={[styles.joyStick, { left: 42 + joy.x * 32, top: 42 + joy.y * 32 }]} />
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
  title: { color: "white", fontSize: 34, fontWeight: "bold", marginBottom: 10 },
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
  ball: { position: "absolute", width: B, height: B, borderRadius: B / 2, backgroundColor: "white", borderWidth: 3, borderColor: "#111", zIndex: 5 },
  player: { position: "absolute", width: P, height: P, borderRadius: P / 2, borderWidth: 2, borderColor: "#111", alignItems: "center", justifyContent: "center", zIndex: 6 },
  playerText: { color: "#111", fontWeight: "bold" },
  goalFlash: { position: "absolute", top: "37%", alignSelf: "center", backgroundColor: "rgba(0,0,0,.75)", paddingHorizontal: 42, paddingVertical: 18, borderRadius: 18, zIndex: 50 },
  goalText: { color: "white", fontSize: 34, fontWeight: "bold" },
  joyBase: { position: "absolute", left: 22, bottom: 22, width: 120, height: 120, borderRadius: 60, backgroundColor: "rgba(0,0,0,.35)", borderWidth: 2, borderColor: "rgba(255,255,255,.45)", zIndex: 30 },
  joyStick: { position: "absolute", width: 36, height: 36, borderRadius: 18, backgroundColor: "white" },
  kick: { position: "absolute", right: 38, bottom: 35, width: 86, height: 86, borderRadius: 43, backgroundColor: "#fdd835", justifyContent: "center", alignItems: "center", zIndex: 30, borderWidth: 3, borderColor: "#111" },
  kickText: { color: "#111", fontWeight: "bold", fontSize: 16 },
  back: { position: "absolute", right: 10, top: 10, backgroundColor: "#111", padding: 9, borderRadius: 9, zIndex: 40 }
});
