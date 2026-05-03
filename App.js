// MC24 Laghouat - Smooth Haxball-like Engine

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

const FW = 620;
const FH = 360;

const P = 46;
const B = 24;

const TEAM_A = "#e53935";
const TEAM_B = "#1e88e5";

const PHYSICS_DT = 16;
const NET_DT = 50;

const PLAYER_SPEED = 5.2;
const ACCEL = 0.18;
const PLAYER_DAMPING = 0.92;

const BALL_DAMPING = 0.998;
const BALL_TOUCH_POWER = 7;
const KICK_POWER = 12;

const GOAL_H = 120;

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
  const [renderBall, setRenderBall] = useState({
    x: FW / 2,
    y: FH / 2,
    vx: 0,
    vy: 0,
    spin: 0
  });

  const [cam, setCam] = useState({ x: 0, y: 0 });

  const socketRef = useRef(null);
  const serverRef = useRef(null);
  const clientsRef = useRef([]);

  const playersRef = useRef({});
  const ballRef = useRef({
    x: FW / 2,
    y: FH / 2,
    vx: 0,
    vy: 0,
    spin: 0
  });

  const scoresRef = useRef({ a: 0, b: 0 });
  const joyRef = useRef({ x: 0, y: 0 });
  const meIdRef = useRef(String(Date.now()));
  const isHostRef = useRef(false);
  const snapBufferRef = useRef([]);
  const pingTimeRef = useRef(0);

  useEffect(() => {
    joyRef.current = joy;
  }, [joy]);

  useEffect(() => {
    isHostRef.current = isHost;
  }, [isHost]);

  function teamColor(t) {
    return t === "A" ? TEAM_A : TEAM_B;
  }

  function send(socket, data) {
    try {
      socket.write(JSON.stringify(data) + "\n");
    } catch {}
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

  function resetBall() {
    ballRef.current = {
      x: FW / 2,
      y: FH / 2,
      vx: 0,
      vy: 0,
      spin: 0
    };
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

    resetBall();
    Vibration.vibrate([0, 80, 40, 120]);
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

      playersRef.current = {
        [id]: mine,
        AI_BOT: ai
      };

      setRenderPlayers(playersRef.current);
      setIsHost(true);
      isHostRef.current = true;

      const server = TcpSocket.createServer(socket => {
        clientsRef.current.push(socket);

        socket.on("data", data => {
          data
            .toString()
            .split("\n")
            .filter(Boolean)
            .forEach(raw => {
              try {
                const msg = JSON.parse(raw);

                if (msg.type === "join" || msg.type === "input") {
                  playersRef.current[msg.player.id] = msg.player;
                }

                if (msg.type === "kick") {
                  applyKick(msg.player);
                }

                if (msg.type === "ping") {
                  send(socket, { type: "pong", t: msg.t });
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
        x: team === "A" ? 130 : FW - 130,
        y: FH / 2,
        vx: 0,
        vy: 0
      };

      playersRef.current = { [id]: mine };
      setRenderPlayers(playersRef.current);

      setIsHost(false);
      isHostRef.current = false;

      const socket = TcpSocket.createConnection(
        { port: PORT, host: hostIp },
        () => {
          socketRef.current = socket;
          setStatus("Connected");
          setScreen("game");
          sendHost({ type: "join", player: mine });
        }
      );

      socket.on("data", data => {
        data
          .toString()
          .split("\n")
          .filter(Boolean)
          .forEach(raw => {
            try {
              const msg = JSON.parse(raw);

              if (msg.type === "snapshot") {
                snapBufferRef.current.push(msg);

                if (snapBufferRef.current.length > 8) {
                  snapBufferRef.current.shift();
                }

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

      socket.on("error", e => {
        Alert.alert("Connection error", String(e));
      });
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
        vx: nx * BALL_TOUCH_POWER + (p.vx || 0) * 0.5,
        vy: ny * BALL_TOUCH_POWER + (p.vy || 0) * 0.5,
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
          name: playerName,
          team,
          vx: nvx * PLAYER_DAMPING,
          vy: nvy * PLAYER_DAMPING,
          x: Math.max(15, Math.min(FW - 55, me.x + nvx)),
          y: Math.max(45, Math.min(FH - 45, me.y + nvy))
        };

        playersRef.current[id] = nextMe;

        if (!isHostRef.current) {
          sendHost({ type: "input", player: nextMe });
        }
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

          playersRef.current = {
            ...latest.players,
            [id]: localMe
          };

          ballRef.current = latest.ball;
        }
      }

      const cameraX = Math.max(-120, Math.min(120, -ballRef.current.x + FW / 2));
      const cameraY = Math.max(-70, Math.min(70, -ballRef.current.y + FH / 2));

      setCam({
        x: cameraX,
        y: cameraY
      });

      setRenderPlayers({ ...playersRef.current });
      setRenderBall({ ...ballRef.current });
    }, PHYSICS_DT);

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
      onPanResponderGrant: (_, g) => updateAnalog(g.dx, g.dy),
      onPanResponderMove: (_, g) => updateAnalog(g.dx, g.dy),
      onPanResponderRelease: () => setJoy({ x: 0, y: 0 })
    })
  ).current;

  function updateAnalog(dx, dy) {
    const max = 45;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    const m = Math.min(1, d / max);

    setJoy({
      x: (dx / d) * m,
      y: (dy / d) * m
    });
  }

  function kick() {
    const p = playersRef.current[meIdRef.current];

    if (!p) return;

    if (isHostRef.current) {
      applyKick(p);
    } else {
      sendHost({ type: "kick", player: p });
    }

    Vibration.vibrate(25);
  }

  if (screen === "menu") {
    return (
      <View style={styles.menu}>
        <Text style={styles.title}>MC24 Laghouat</Text>
        <Text style={styles.subtitle}>Smooth Local Football</Text>

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

        <TextInput
          style={styles.input}
          value={hostIp}
          onChangeText={setHostIp}
          placeholder="Host IP مثل 192.168.43.1"
        />

        <TouchableOpacity style={styles.button} onPress={joinHost}>
          <Text style={styles.btnText}>Join Room</Text>
        </TouchableOpacity>

        <Text style={styles.status}>{status}</Text>
      </View>
    );
  }

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

          <View
            style={[
              styles.ball,
              {
                left: renderBall.x,
                top: renderBall.y,
                transform: [{ rotate: `${renderBall.spin * 12}deg` }]
              }
            ]}
          />

          {Object.values(renderPlayers).map(p => (
            <View
              key={p.id}
              style={[
                styles.player,
                {
                  left: p.x,
                  top: p.y,
                  backgroundColor: teamColor(p.team),
                  opacity: p.ai ? 0.72 : 1
                }
              ]}
            >
              <Text style={styles.playerText}>
                {(p.name || "P").slice(0, 2).toUpperCase()}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <Text style={styles.score}>
        {roomName} | {teamAName} {scoreA} - {scoreB} {teamBName}
      </Text>

      <Text style={styles.ping}>
        {isHost ? "HOST 20Hz" : `PING ${ping}ms`}
      </Text>

      {goalFlash !== "" && (
        <View style={styles.goalFlash}>
          <Text style={styles.goalText}>{goalFlash}</Text>
        </View>
      )}

      <View style={styles.joyBase} {...joyResponder.panHandlers}>
        <View
          style={[
            styles.joyStick,
            {
              left: 42 + joy.x * 32,
              top: 42 + joy.y * 32
            }
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
  menu: {
    flex: 1,
    backgroundColor: "#123f25",
    justifyContent: "center",
    alignItems: "center"
  },
  title: {
    color: "white",
    fontSize: 34,
    fontWeight: "bold"
  },
  subtitle: {
    color: "#d7ffd7",
    marginBottom: 10,
    fontWeight: "600"
  },
  input: {
    width: 290,
    backgroundColor: "white",
    padding: 10,
    borderRadius: 12,
    marginVertical: 4
  },
  row: {
    flexDirection: "row",
    marginVertical: 6
  },
  teamBtn: {
    width: 135,
    backgroundColor: "#111",
    padding: 12,
    borderRadius: 14,
    alignItems: "center",
    marginHorizontal: 5
  },
  a: {
    backgroundColor: TEAM_A
  },
  b: {
    backgroundColor: TEAM_B
  },
  button: {
    width: 290,
    backgroundColor: "#111",
    padding: 13,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 6
  },
  btnText: {
    color: "white",
    fontWeight: "bold"
  },
  status: {
    color: "white",
    marginTop: 8
  },
  screen: {
    flex: 1,
    backgroundColor: "#0e301d",
    overflow: "hidden"
  },
  camera: {
    position: "absolute",
    left: 70,
    top: 45
  },
  field: {
    width: FW,
    height: FH,
    backgroundColor: "#1f7a3d",
    borderWidth: 4,
    borderColor: "white",
    overflow: "visible"
  },
  grassLine1: {
    position: "absolute",
    left: FW * 0.25,
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: "rgba(255,255,255,0.08)"
  },
  grassLine2: {
    position: "absolute",
    left: FW * 0.75,
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: "rgba(255,255,255,0.08)"
  },
  centerLine: {
    position: "absolute",
    left: FW / 2,
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: "white",
    opacity: 0.85
  },
  centerCircle: {
    position: "absolute",
    left: FW / 2 - 55,
    top: FH / 2 - 55,
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 2,
    borderColor: "white",
    opacity: 0.85
  },
  goalLeft: {
    position: "absolute",
    left: -20,
    top: FH / 2 - GOAL_H / 2,
    width: 20,
    height: GOAL_H,
    borderWidth: 3,
    borderColor: "white",
    borderRightWidth: 0
  },
  goalRight: {
    position: "absolute",
    right: -20,
    top: FH / 2 - GOAL_H / 2,
    width: 20,
    height: GOAL_H,
    borderWidth: 3,
    borderColor: "white",
    borderLeftWidth: 0
  },
  netLeft: {
    position: "absolute",
    left: -23,
    top: FH / 2 - GOAL_H / 2,
    width: 3,
    height: GOAL_H,
    backgroundColor: "rgba(255,255,255,0.7)"
  },
  netRight: {
    position: "absolute",
    right: -23,
    top: FH / 2 - GOAL_H / 2,
    width: 3,
    height: GOAL_H,
    backgroundColor: "rgba(255,255,255,0.7)"
  },
  ball: {
    position: "absolute",
    width: B,
    height: B,
    borderRadius: B / 2,
    backgroundColor: "white",
    borderWidth: 3,
    borderColor: "#111",
    zIndex: 5
  },
  player: {
    position: "absolute",
    width: P,
    height: P,
    borderRadius: P / 2,
    borderWidth: 2,
    borderColor: "#111",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 6
  },
  playerText: {
    color: "#111",
    fontWeight: "bold"
  },
  score: {
    position: "absolute",
    top: 10,
    alignSelf: "center",
    color: "white",
    fontSize: 18,
    fontWeight: "bold",
    zIndex: 20,
    backgroundColor: "rgba(0,0,0,.45)",
    paddingHorizontal: 16,
    paddingVertical: 5,
    borderRadius: 10
  },
  ping: {
    position: "absolute",
    top: 12,
    left: 12,
    color: "white",
    fontWeight: "bold",
    zIndex: 20,
    backgroundColor: "rgba(0,0,0,.45)",
    padding: 8,
    borderRadius: 8
  },
  goalFlash: {
    position: "absolute",
    top: "37%",
    alignSelf: "center",
    backgroundColor: "rgba(0,0,0,.75)",
    paddingHorizontal: 42,
    paddingVertical: 18,
    borderRadius: 18,
    zIndex: 50
  },
  goalText: {
    color: "white",
    fontSize: 34,
    fontWeight: "bold"
  },
  joyBase: {
    position: "absolute",
    left: 22,
    bottom: 22,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "rgba(0,0,0,.35)",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,.45)",
    zIndex: 30
  },
  joyStick: {
    position: "absolute",
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "white"
  },
  kick: {
    position: "absolute",
    right: 38,
    bottom: 35,
    width: 86,
    height: 86,
    borderRadius: 43,
    backgroundColor: "#fdd835",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 30,
    borderWidth: 3,
    borderColor: "#111"
  },
  kickText: {
    color: "#111",
    fontWeight: "bold",
    fontSize: 16
  },
  back: {
    position: "absolute",
    right: 10,
    top: 10,
    backgroundColor: "#111",
    padding: 9,
    borderRadius: 9,
    zIndex: 40
  }
});
