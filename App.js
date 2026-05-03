// MC24FOOTBALL - Pro UI + Smooth Local Engine

import React, { useEffect, useRef, useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  Alert, Vibration, PanResponder, ScrollView
} from "react-native";
import TcpSocket from "react-native-tcp-socket";

const PORT = 2424;
const FW = 620, FH = 360;
const P = 46, B = 24;
const TEAM_A = "#e53935", TEAM_B = "#1e88e5";

const PHYSICS_DT = 16;
const NET_DT = 50;
const PLAYER_SPEED = 5.2;
const ACCEL = 0.18;
const PLAYER_DAMPING = 0.92;
const BALL_DAMPING = 0.998;
const TOUCH_POWER = 7;
const KICK_POWER = 12;
const GOAL_H = 120;

export default function App() {
  const [screen, setScreen] = useState("home");
  const [isHost, setIsHost] = useState(false);

  const [roomName, setRoomName] = useState("MC24 Room");
  const [playerName, setPlayerName] = useState("");
  const [team, setTeam] = useState("A");
  const [teamAName, setTeamAName] = useState("RED");
  const [teamBName, setTeamBName] = useState("BLUE");
  const [hostIp, setHostIp] = useState("");
  const [status, setStatus] = useState("Offline");

  const [scoreA, setScoreA] = useState(0);
  const [scoreB, setScoreB] = useState(0);
  const [ping, setPing] = useState(0);
  const [goalFlash, setGoalFlash] = useState("");
  const [joy, setJoy] = useState({ x: 0, y: 0 });

  const [renderPlayers, setRenderPlayers] = useState({});
  const [renderBall, setRenderBall] = useState({ x: FW / 2, y: FH / 2, vx: 0, vy: 0, spin: 0 });
  const [cam, setCam] = useState({ x: 0, y: 0 });

  const socketRef = useRef(null);
  const serverRef = useRef(null);
  const clientsRef = useRef([]);
  const playersRef = useRef({});
  const ballRef = useRef({ x: FW / 2, y: FH / 2, vx: 0, vy: 0, spin: 0 });
  const scoresRef = useRef({ a: 0, b: 0 });
  const joyRef = useRef({ x: 0, y: 0 });
  const meIdRef = useRef(String(Date.now()));
  const isHostRef = useRef(false);
  const snapBufferRef = useRef([]);
  const pingTimeRef = useRef(0);

  useEffect(() => { joyRef.current = joy; }, [joy]);
  useEffect(() => { isHostRef.current = isHost; }, [isHost]);

  function teamColor(t) { return t === "A" ? TEAM_A : TEAM_B; }

  function send(socket, data) {
    try { socket.write(JSON.stringify(data) + "\n"); } catch {}
  }

  function sendAll(data) {
    clientsRef.current.forEach(s => send(s, data));
  }

  function sendHost(data) {
    if (socketRef.current) send(socketRef.current, data);
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

  function resetMatch() {
    scoresRef.current = { a: 0, b: 0 };
    setScoreA(0);
    setScoreB(0);
    ballRef.current = { x: FW / 2, y: FH / 2, vx: 0, vy: 0, spin: 0 };
  }

  function showGoal(side) {
    if (side === "A") {
      scoresRef.current.a += 1;
      setScoreA(scoresRef.current.a);
      setGoalFlash("GOAL " + teamAName);
    } else {
      scoresRef.current.b += 1;
      setScoreB(scoresRef.current.b);
      setGoalFlash("GOAL " + teamBName);
    }

    ballRef.current = { x: FW / 2, y: FH / 2, vx: 0, vy: 0, spin: 0 };
    Vibration.vibrate([0, 80, 40, 120]);
    broadcastSnapshot();
    setTimeout(() => setGoalFlash(""), 1200);
  }

  function createInitialPlayers(withAi = true) {
    const id = meIdRef.current;
    const name = playerName.trim() || "Player";

    const mine = {
      id,
      name,
      team,
      x: team === "A" ? 110 : FW - 110,
      y: FH / 2,
      vx: 0,
      vy: 0
    };

    const ai = {
      id: "AI_BOT",
      name: "AI",
      team: team === "A" ? "B" : "A",
      x: team === "A" ? FW - 110 : 110,
      y: FH / 2,
      vx: 0,
      vy: 0,
      ai: true
    };

    playersRef.current = withAi ? { [id]: mine, AI_BOT: ai } : { [id]: mine };
    setRenderPlayers(playersRef.current);
  }

  function playAgainstAI() {
    resetMatch();
    createInitialPlayers(true);
    setIsHost(true);
    isHostRef.current = true;
    setStatus("Playing against AI");
    setScreen("game");
  }

  function startRoomHost() {
    try {
      resetMatch();
      createInitialPlayers(true);

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

              if (msg.type === "kick") applyKick(msg.player);

              if (msg.type === "ping") send(socket, { type: "pong", t: msg.t });
            } catch {}
          });
        });

        socket.on("close", () => {
          clientsRef.current = clientsRef.current.filter(x => x !== socket);
        });
      });

      server.listen({ port: PORT, host: "0.0.0.0" }, () => {
        setStatus("Room created | Port " + PORT);
        setScreen("game");
      });

      serverRef.current = server;
    } catch (e) {
      Alert.alert("Host error", String(e));
    }
  }

  function joinRoom() {
    try {
      const id = meIdRef.current;
      const name = playerName.trim() || "Player";

      const mine = {
        id,
        name,
        team,
        x: team === "A" ? 130 : FW - 130,
        y: FH / 2,
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

            if (msg.type === "pong") setPing(Date.now() - msg.t);
          } catch {}
        });
      });

      socket.on("error", e => Alert.alert("Connection error", String(e)));
    } catch (e) {
      Alert.alert("Join error", String(e));
    }
  }

  function applyKick(p) {
    const b = ballRef.current;
    const dx = b.x - p.x;
    const dy = b.y - p.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;

    if (d < 92) {
      ballRef.current = {
        ...b,
        vx: (dx / d) * KICK_POWER + (p.vx || 0) * 0.6,
        vy: (dy / d) * KICK_POWER + (p.vy || 0) * 0.6,
        spin: Math.max(-5, Math.min(5, (p.vx || 0) * 0.5))
      };

      Vibration.vibrate(25);
    }
  }

  function collidePlayerBall(p, b) {
    const dx = b.x - p.x;
    const dy = b.y - p.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;

    if (d < 54) {
      const nx = dx / d;
      const ny = dy / d;

      return {
        ...b,
        x: p.x + nx * 54,
        y: p.y + ny * 54,
        vx: nx * TOUCH_POWER + (p.vx || 0) * 0.5,
        vy: ny * TOUCH_POWER + (p.vy || 0) * 0.5,
        spin: Math.max(-5, Math.min(5, (p.vx || 0) * 0.4))
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
    const speed = 3.7;

    const vx = (dx / d) * speed;
    const vy = (dy / d) * speed;

    return {
      ...map,
      AI_BOT: {
        ...ai,
        vx,
        vy,
        x: Math.max(15, Math.min(FW - 55, ai.x + vx)),
        y: Math.max(45, Math.min(FH - 45, ai.y + vy))
      }
    };
  }

  useEffect(() => {
    if (screen !== "game") return;

    const physics = setInterval(() => {
      const id = meIdRef.current;
      const me = playersRef.current[id];

      if (me) {
        const j = joyRef.current;
        const targetVx = j.x * PLAYER_SPEED;
        const targetVy = j.y * PLAYER_SPEED;

        const nvx = me.vx + (targetVx - me.vx) * ACCEL;
        const nvy = me.vy + (targetVy - me.vy) * ACCEL;

        const nextMe = {
          ...me,
          name: playerName.trim() || "Player",
          team,
          vx: nvx * PLAYER_DAMPING,
          vy: nvy * PLAYER_DAMPING,
          x: Math.max(15, Math.min(FW - 55, me.x + nvx)),
          y: Math.max(45, Math.min(FH - 45, me.y + nvy))
        };

        playersRef.current[id] = nextMe;

        if (!isHostRef.current) sendHost({ type: "input", player: nextMe });
      }

      if (isHostRef.current) {
        let map = updateAI(playersRef.current, ballRef.current);
        playersRef.current = map;

        let b = ballRef.current;

        b = {
          x: b.x + b.vx,
          y: b.y + b.vy + b.spin * 0.08,
          vx: b.vx * BALL_DAMPING,
          vy: b.vy * BALL_DAMPING,
          spin: b.spin * 0.985
        };

        Object.values(map).forEach(pl => {
          b = collidePlayerBall(pl, b);
        });

        if (b.y < 42) {
          b.y = 42;
          b.vy *= -0.88;
          b.spin *= 0.75;
        }

        if (b.y > FH - B - 4) {
          b.y = FH - B - 4;
          b.vy *= -0.88;
          b.spin *= 0.75;
        }

        const goalTop = FH / 2 - GOAL_H / 2;
        const goalBottom = FH / 2 + GOAL_H / 2;

        if (b.x < -15 && b.y > goalTop && b.y < goalBottom) {
          showGoal("B");
          return;
        }

        if (b.x > FW + 15 && b.y > goalTop && b.y < goalBottom) {
          showGoal("A");
          return;
        }

        if (b.x < 10 && !(b.y > goalTop && b.y < goalBottom)) {
          b.x = 10;
          b.vx *= -0.75;
        }

        if (b.x > FW - B && !(b.y > goalTop && b.y < goalBottom)) {
          b.x = FW - B;
          b.vx *= -0.75;
        }

        ballRef.current = b;
      } else {
        const latest = snapBufferRef.current[snapBufferRef.current.length - 1];

        if (latest) {
          const localMe = playersRef.current[id];
          playersRef.current = { ...latest.players, [id]: localMe };
          ballRef.current = latest.ball;
        }
      }

      const cameraX = Math.max(-120, Math.min(120, -ballRef.current.x + FW / 2));
      const cameraY = Math.max(-70, Math.min(70, -ballRef.current.y + FH / 2));

      setCam({ x: cameraX, y: cameraY });
      setRenderPlayers({ ...playersRef.current });
      setRenderBall({ ...ballRef.current });
    }, 16);

    const net = setInterval(() => {
      if (isHostRef.current) {
        broadcastSnapshot();
      } else {
        const now = Date.now();
        if (now - pingTimeRef.current > 1000) {
          pingTimeRef.current = now;
          sendHost({ type: "ping", t: now });
        }
      }
    }, 50);

    return () => {
      clearInterval(physics);
      clearInterval(net);
    };
  }, [screen, playerName, team]);

  const joyResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (_, g) => updateAnalog(g.dx, g.dy),
      onPanResponderMove: (_, g) => updateAnalog(g.dx, g.dy),
      onPanResponderRelease: () => setJoy({ x: 0, y: 0 })
    })
  ).current;

  function updateAnalog(dx, dy) {
    const max = 45;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    const m = Math.min(1, d / max);
    setJoy({ x: (dx / d) * m, y: (dy / d) * m });
  }

  function kick() {
    const p = playersRef.current[meIdRef.current];
    if (!p) return;

    if (isHostRef.current) applyKick(p);
    else sendHost({ type: "kick", player: p });

    Vibration.vibrate(25);
  }

  function HomeScreen() {
    return (
      <View style={styles.home}>
        <View style={styles.bgField}>
          <View style={styles.bgCenterLine} />
          <View style={styles.bgCircle} />
          <View style={styles.bgGoalLeft} />
          <View style={styles.bgGoalRight} />

          <View style={[styles.bgPlayer, { left: 90, top: 180, backgroundColor: TEAM_A }]} />
          <View style={[styles.bgPlayer, { left: 195, top: 250, backgroundColor: TEAM_A }]} />
          <View style={[styles.bgPlayer, { right: 110, top: 140, backgroundColor: TEAM_B }]} />
          <View style={[styles.bgPlayer, { right: 220, top: 250, backgroundColor: TEAM_B }]} />
          <View style={styles.bgBall} />
        </View>

        <Text style={styles.logo}>MC24FOOTBALL</Text>

        <View style={styles.userCard}>
          <Text style={styles.userLabel}>USERNAME:</Text>
          <TextInput
            style={styles.usernameInput}
            value={playerName}
            onChangeText={setPlayerName}
            placeholder="Enter Username..."
            placeholderTextColor="#888"
          />
          <View style={styles.avatar}>
            <Text style={{ fontSize: 28 }}>👤</Text>
          </View>
        </View>

        <View style={styles.mainButtonsRow}>
          <TouchableOpacity style={styles.playAiBtn} onPress={playAgainstAI}>
            <Text style={styles.bigIcon}>🤖</Text>
            <Text style={styles.bigBtnText}>PLAY{"\n"}AGAINST AI</Text>
            <Text style={styles.smallBtnText}>Train and play alone</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.createBtn} onPress={() => setScreen("create")}>
            <Text style={styles.bigIcon}>🔑</Text>
            <Text style={styles.bigBtnText}>CREATE A{"\n"}GAME ROOM</Text>
            <Text style={styles.smallBtnText}>Create room and invite friends</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.roomsBtn} onPress={() => setScreen("rooms")}>
          <Text style={styles.roomsText}>AVAILABLE ROOMS LIST</Text>
        </TouchableOpacity>

        <View style={styles.bottomPanel}>
          <TouchableOpacity style={styles.bottomItem} onPress={() => setScreen("settings")}>
            <Text style={styles.bottomIcon}>⚙️</Text>
            <Text style={styles.bottomText}>SETTINGS</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.bottomItem} onPress={() => setScreen("leaderboards")}>
            <Text style={styles.bottomIcon}>📊</Text>
            <Text style={styles.bottomText}>LEADERBOARDS</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.bottomItem} onPress={() => setScreen("help")}>
            <Text style={styles.bottomIcon}>❔</Text>
            <Text style={styles.bottomText}>HELP</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.bottomItem} onPress={() => Alert.alert("Exit", "اغلق التطبيق من زر الرجوع في الهاتف")}>
            <Text style={styles.bottomIcon}>↪</Text>
            <Text style={styles.bottomText}>EXIT</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  function CreateScreen() {
    return (
      <View style={styles.windowScreen}>
        <Text style={styles.windowTitle}>CREATE GAME ROOM</Text>

        <TextInput style={styles.input} value={roomName} onChangeText={setRoomName} placeholder="Room name" />
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

        <TouchableOpacity style={styles.button} onPress={startRoomHost}>
          <Text style={styles.btnText}>START HOST ROOM</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.backWindowBtn} onPress={() => setScreen("home")}>
          <Text style={styles.btnText}>BACK</Text>
        </TouchableOpacity>
      </View>
    );
  }

  function RoomsScreen() {
    return (
      <View style={styles.windowScreen}>
        <Text style={styles.windowTitle}>AVAILABLE ROOMS</Text>
        <Text style={styles.windowNote}>Local WiFi: ادخل IP الهاتف الذي أنشأ الغرفة</Text>

        <TextInput
          style={styles.input}
          value={hostIp}
          onChangeText={setHostIp}
          placeholder="Host IP مثل 192.168.43.1"
        />

        <View style={styles.row}>
          <TouchableOpacity style={[styles.teamBtn, team === "A" && styles.a]} onPress={() => setTeam("A")}>
            <Text style={styles.btnText}>TEAM A</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.teamBtn, team === "B" && styles.b]} onPress={() => setTeam("B")}>
            <Text style={styles.btnText}>TEAM B</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.button} onPress={joinRoom}>
          <Text style={styles.btnText}>JOIN ROOM</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.backWindowBtn} onPress={() => setScreen("home")}>
          <Text style={styles.btnText}>BACK</Text>
        </TouchableOpacity>

        <Text style={styles.status}>{status}</Text>
      </View>
    );
  }

  function SimpleWindow({ title, text }) {
    return (
      <View style={styles.windowScreen}>
        <Text style={styles.windowTitle}>{title}</Text>
        <Text style={styles.windowText}>{text}</Text>

        <TouchableOpacity style={styles.backWindowBtn} onPress={() => setScreen("home")}>
          <Text style={styles.btnText}>BACK</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (screen === "home") return <HomeScreen />;
  if (screen === "create") return <CreateScreen />;
  if (screen === "rooms") return <RoomsScreen />;
  if (screen === "settings") return <SimpleWindow title="SETTINGS" text="هنا لاحقًا نضيف: الصوت، سرعة اللعب، حجم الملعب، ألوان الفرق، وعدد اللاعبين." />;
  if (screen === "leaderboards") return <SimpleWindow title="LEADERBOARDS" text="الترتيب المحلي سيضاف لاحقًا: عدد الانتصارات، الأهداف، وأفضل لاعب." />;
  if (screen === "help") return <SimpleWindow title="HELP" text="Play Against AI: تدريب منفرد. Create Game Room: أنشئ غرفة عبر WiFi. Available Rooms: ادخل IP المضيف وانضم." />;

  return (
    <View style={styles.screen}>
      <View style={[styles.camera, { transform: [{ translateX: cam.x }, { translateY: cam.y }] }]}>
        <View style={styles.field}>
          <View style={styles.grassLine1} />
          <View style={styles.grassLine2} />
          <View style={styles.centerLine} />
          <View style={styles.centerCircle} />
          <View style={styles.goalLeft} />
          <View style={styles.goalRight} />
          <View style={styles.netLeft} />
          <View style={styles.netRight} />

          <View style={[styles.ball, { left: renderBall.x, top: renderBall.y, transform: [{ rotate: `${renderBall.spin * 12}deg` }] }]} />

          {Object.values(renderPlayers).map(p => (
            <View key={p.id} style={[styles.player, { left: p.x, top: p.y, backgroundColor: teamColor(p.team), opacity: p.ai ? 0.72 : 1 }]}>
              <Text style={styles.playerText}>{(p.name || "P").slice(0, 2).toUpperCase()}</Text>
            </View>
          ))}
        </View>
      </View>

      <Text style={styles.score}>{roomName} | {teamAName} {scoreA} - {scoreB} {teamBName}</Text>
      <Text style={styles.ping}>{isHost ? "HOST 20Hz" : `PING ${ping}ms`}</Text>

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

      <TouchableOpacity style={styles.back} onPress={() => setScreen("home")}>
        <Text style={styles.btnText}>Menu</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  home: { flex: 1, backgroundColor: "#0d1f35", alignItems: "center", justifyContent: "center" },
  bgField: { position: "absolute", left: 25, right: 25, top: 25, bottom: 20, borderRadius: 35, backgroundColor: "#132b49", borderWidth: 4, borderColor: "rgba(255,255,255,.45)", overflow: "hidden" },
  bgCenterLine: { position: "absolute", left: "50%", top: 0, bottom: 0, width: 3, backgroundColor: "rgba(255,255,255,.45)" },
  bgCircle: { position: "absolute", left: "50%", top: "50%", width: 150, height: 150, marginLeft: -75, marginTop: -75, borderRadius: 75, borderWidth: 3, borderColor: "rgba(255,255,255,.45)" },
  bgGoalLeft: { position: "absolute", left: 0, top: "32%", width: 45, height: 120, borderWidth: 4, borderLeftWidth: 0, borderColor: "rgba(255,255,255,.55)" },
  bgGoalRight: { position: "absolute", right: 0, top: "32%", width: 45, height: 120, borderWidth: 4, borderRightWidth: 0, borderColor: "rgba(255,255,255,.55)" },
  bgPlayer: { position: "absolute", width: 28, height: 28, borderRadius: 14, borderWidth: 3, borderColor: "rgba(0,0,0,.45)" },
  bgBall: { position: "absolute", right: 135, top: 185, width: 26, height: 26, borderRadius: 13, backgroundColor: "white", shadowColor: "#7ddcff", elevation: 10 },
  logo: { color: "white", fontSize: 42, fontWeight: "900", textShadowColor: "#000", textShadowOffset: { width: 3, height: 3 }, textShadowRadius: 2, marginBottom: 12 },
  userCard: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(0,0,0,.62)", borderRadius: 16, padding: 12, borderWidth: 2, borderColor: "rgba(255,255,255,.15)", marginBottom: 14 },
  userLabel: { color: "white", fontWeight: "900", marginRight: 10 },
  usernameInput: { width: 230, height: 44, color: "white", borderWidth: 2, borderColor: "white", borderRadius: 10, paddingHorizontal: 12, backgroundColor: "rgba(0,0,0,.4)" },
  avatar: { width: 54, height: 54, borderRadius: 10, backgroundColor: "#e7f1ff", alignItems: "center", justifyContent: "center", marginLeft: 10 },
  mainButtonsRow: { flexDirection: "row", gap: 14 },
  playAiBtn: { width: 230, height: 105, backgroundColor: "#3bd13b", borderRadius: 14, borderWidth: 3, borderColor: "#062b07", alignItems: "center", justifyContent: "center" },
  createBtn: { width: 230, height: 105, backgroundColor: "#1fa7ff", borderRadius: 14, borderWidth: 3, borderColor: "#061f36", alignItems: "center", justifyContent: "center" },
  bigIcon: { position: "absolute", left: 18, top: 28, fontSize: 26 },
  bigBtnText: { color: "white", fontSize: 24, fontWeight: "900", textAlign: "center", textShadowColor: "#000", textShadowOffset: { width: 2, height: 2 }, textShadowRadius: 1 },
  smallBtnText: { color: "white", fontSize: 11, marginTop: 4, fontWeight: "bold" },
  roomsBtn: { marginTop: 16, backgroundColor: "#ff9800", paddingVertical: 14, paddingHorizontal: 35, borderRadius: 14, borderWidth: 3, borderColor: "#5b2e00" },
  roomsText: { color: "white", fontSize: 18, fontWeight: "900" },
  bottomPanel: { position: "absolute", bottom: 10, flexDirection: "row", backgroundColor: "rgba(0,0,0,.65)", paddingHorizontal: 28, paddingVertical: 10, borderRadius: 22, borderWidth: 2, borderColor: "rgba(255,255,255,.2)" },
  bottomItem: { width: 105, alignItems: "center" },
  bottomIcon: { fontSize: 26 },
  bottomText: { color: "white", fontWeight: "900", fontSize: 12 },
  windowScreen: { flex: 1, backgroundColor: "#123f25", alignItems: "center", justifyContent: "center" },
  windowTitle: { color: "white", fontSize: 32, fontWeight: "900", marginBottom: 18 },
  windowText: { color: "white", fontSize: 18, textAlign: "center", width: "75%", lineHeight: 28 },
  windowNote: { color: "#d7ffd7", marginBottom: 10 },
  input: { width: 290, backgroundColor: "white", padding: 10, borderRadius: 12, marginVertical: 5 },
  row: { flexDirection: "row", marginVertical: 6 },
  teamBtn: { width: 135, backgroundColor: "#111", padding: 12, borderRadius: 14, alignItems: "center", marginHorizontal: 5 },
  a: { backgroundColor: TEAM_A },
  b: { backgroundColor: TEAM_B },
  button: { width: 290, backgroundColor: "#111", padding: 13, borderRadius: 14, alignItems: "center", marginTop: 6 },
  backWindowBtn: { width: 180, backgroundColor: "#555", padding: 13, borderRadius: 14, alignItems: "center", marginTop: 15 },
  btnText: { color: "white", fontWeight: "bold" },
  status: { color: "white", marginTop: 8 },
  screen: { flex: 1, backgroundColor: "#0e301d", overflow: "hidden" },
  camera: { position: "absolute", left: 70, top: 45 },
  field: { width: FW, height: FH, backgroundColor: "#1f7a3d", borderWidth: 4, borderColor: "white", overflow: "visible" },
  grassLine1: { position: "absolute", left: FW * 0.25, top: 0, bottom: 0, width: 2, backgroundColor: "rgba(255,255,255,0.08)" },
  grassLine2: { position: "absolute", left: FW * 0.75, top: 0, bottom: 0, width: 2, backgroundColor: "rgba(255,255,255,0.08)" },
  centerLine: { position: "absolute", left: FW / 2, top: 0, bottom: 0, width: 2, backgroundColor: "white", opacity: 0.85 },
  centerCircle: { position: "absolute", left: FW / 2 - 55, top: FH / 2 - 55, width: 110, height: 110, borderRadius: 55, borderWidth: 2, borderColor: "white", opacity: 0.85 },
  goalLeft: { position: "absolute", left: -20, top: FH / 2 - GOAL_H / 2, width: 20, height: GOAL_H, borderWidth: 3, borderColor: "white", borderRightWidth: 0 },
  goalRight: { position: "absolute", right: -20, top: FH / 2 - GOAL_H / 2, width: 20, height: GOAL_H, borderWidth: 3, borderColor: "white", borderLeftWidth: 0 },
  netLeft: { position: "absolute", left: -23, top: FH / 2 - GOAL_H / 2, width: 3, height: GOAL_H, backgroundColor: "rgba(255,255,255,0.7)" },
  netRight: { position: "absolute", right: -23, top: FH / 2 - GOAL_H / 2, width: 3, height: GOAL_H, backgroundColor: "rgba(255,255,255,0.7)" },
  ball: { position: "absolute", width: B, height: B, borderRadius: B / 2, backgroundColor: "white", borderWidth: 3, borderColor: "#111", zIndex: 5 },
  player: { position: "absolute", width: P, height: P, borderRadius: P / 2, borderWidth: 2, borderColor: "#111", alignItems: "center", justifyContent: "center", zIndex: 6 },
  playerText: { color: "#111", fontWeight: "bold" },
  score: { position: "absolute", top: 10, alignSelf: "center", color: "white", fontSize: 18, fontWeight: "bold", zIndex: 20, backgroundColor: "rgba(0,0,0,.45)", paddingHorizontal: 16, paddingVertical: 5, borderRadius: 10 },
  ping: { position: "absolute", top: 12, left: 12, color: "white", fontWeight: "bold", zIndex: 20, backgroundColor: "rgba(0,0,0,.45)", padding: 8, borderRadius: 8 },
  goalFlash: { position: "absolute", top: "37%", alignSelf: "center", backgroundColor: "rgba(0,0,0,.75)", paddingHorizontal: 42, paddingVertical: 18, borderRadius: 18, zIndex: 50 },
  goalText: { color: "white", fontSize: 34, fontWeight: "bold" },
  joyBase: { position: "absolute", left: 22, bottom: 22, width: 120, height: 120, borderRadius: 60, backgroundColor: "rgba(0,0,0,.35)", borderWidth: 2, borderColor: "rgba(255,255,255,.45)", zIndex: 30 },
  joyStick: { position: "absolute", width: 36, height: 36, borderRadius: 18, backgroundColor: "white" },
  kick: { position: "absolute", right: 38, bottom: 35, width: 86, height: 86, borderRadius: 43, backgroundColor: "#fdd835", justifyContent: "center", alignItems: "center", zIndex: 30, borderWidth: 3, borderColor: "#111" },
  kickText: { color: "#111", fontWeight: "bold", fontSize: 16 },
  back: { position: "absolute", right: 10, top: 10, backgroundColor: "#111", padding: 9, borderRadius: 9, zIndex: 40 }
});
