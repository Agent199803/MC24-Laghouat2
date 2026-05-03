import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  Vibration
} from "react-native";

import TcpSocket from "react-native-tcp-socket";
import { Audio } from "expo-av";

const PORT = 2424;
const FIELD_W = 760;
const FIELD_H = 430;

const TEAM_A_COLOR = "#e53935";
const TEAM_B_COLOR = "#1e88e5";

const PLAYER_SIZE = 48;
const BALL_SIZE = 28;

export default function App() {
  const [screen, setScreen] = useState("menu");
  const [isHost, setIsHost] = useState(false);

  const [roomName, setRoomName] = useState("Room-1");
  const [playerName, setPlayerName] = useState("Player");
  const [team, setTeam] = useState("A");
  const [teamAName, setTeamAName] = useState("MC24");
  const [teamBName, setTeamBName] = useState("Guest");
  const [hostIp, setHostIp] = useState("");
  const [status, setStatus] = useState("Offline");

  const [ping, setPing] = useState(0);
  const pingStartRef = useRef(0);

  const [goalFlash, setGoalFlash] = useState("");
  const [aiEnabled, setAiEnabled] = useState(true);

  const [joy, setJoy] = useState({ dx: 0, dy: 0 });

  const [scoreA, setScoreA] = useState(0);
  const [scoreB, setScoreB] = useState(0);

  const [players, setPlayers] = useState({});
  const [me, setMe] = useState({
    id: String(Date.now()),
    x: 120,
    y: 210,
    team: "A",
    name: "Player"
  });

  const [ball, setBall] = useState({
    x: 370,
    y: 210,
    vx: 0,
    vy: 0
  });

  const serverRef = useRef(null);
  const clientsRef = useRef([]);
  const socketRef = useRef(null);

  const meRef = useRef(me);
  const ballRef = useRef(ball);
  const playersRef = useRef(players);

  useEffect(() => {
    meRef.current = me;
  }, [me]);

  useEffect(() => {
    ballRef.current = ball;
  }, [ball]);

  useEffect(() => {
    playersRef.current = players;
  }, [players]);

  function playerColor(pTeam) {
    return pTeam === "A" ? TEAM_A_COLOR : TEAM_B_COLOR;
  }

  async function playBeep() {
    try {
      Vibration.vibrate(60);
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
    } catch {}
  }

  function sendAll(data) {
    const msg = JSON.stringify(data) + "\n";
    clientsRef.current.forEach(socket => {
      try {
        socket.write(msg);
      } catch {}
    });
  }

  function sendToHost(data) {
    if (!socketRef.current) return;
    try {
      socketRef.current.write(JSON.stringify(data) + "\n");
    } catch {}
  }

  function broadcastState(nextBall, a, b, nextPlayers = playersRef.current) {
    sendAll({
      type: "state",
      roomName,
      ball: nextBall,
      scoreA: a,
      scoreB: b,
      players: nextPlayers,
      teamAName,
      teamBName
    });
  }

  function showGoal(text) {
    setGoalFlash(text);
    playBeep();
    setTimeout(() => setGoalFlash(""), 1300);
  }

  function startHost() {
    try {
      const startX = team === "A" ? 120 : 620;
      const nextMe = {
        ...meRef.current,
        name: playerName,
        team,
        x: startX,
        y: 210
      };

      const aiBot = {
        id: "AI_BOT",
        name: "AI",
        team: team === "A" ? "B" : "A",
        x: team === "A" ? 620 : 120,
        y: 210,
        ai: true
      };

      const initialPlayers = aiEnabled
        ? { [nextMe.id]: nextMe, [aiBot.id]: aiBot }
        : { [nextMe.id]: nextMe };

      setMe(nextMe);
      setPlayers(initialPlayers);
      setIsHost(true);

      const server = TcpSocket.createServer(socket => {
        clientsRef.current.push(socket);

        socket.on("data", data => {
          const messages = data.toString().split("\n").filter(Boolean);

          messages.forEach(raw => {
            try {
              const msg = JSON.parse(raw);

              if (msg.type === "join" || msg.type === "move") {
                setPlayers(prev => {
                  const updated = { ...prev, [msg.player.id]: msg.player };
                  broadcastState(ballRef.current, scoreA, scoreB, updated);
                  return updated;
                });
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
        setStatus("Host ready | Port " + PORT);
        setScreen("game");
      });

      serverRef.current = server;
    } catch (e) {
      Alert.alert("Host error", String(e));
    }
  }

  function joinHost() {
    try {
      const startX = team === "A" ? 160 : 600;
      const nextMe = {
        ...meRef.current,
        name: playerName,
        team,
        x: startX,
        y: 210
      };

      setMe(nextMe);
      setIsHost(false);

      const socket = TcpSocket.createConnection(
        { port: PORT, host: hostIp },
        () => {
          socketRef.current = socket;
          setStatus("Connected");
          setScreen("game");
          sendToHost({ type: "join", player: nextMe });
        }
      );

      socket.on("data", data => {
        const messages = data.toString().split("\n").filter(Boolean);

        messages.forEach(raw => {
          try {
            const msg = JSON.parse(raw);

            if (msg.type === "state") {
              setPlayers(msg.players || {});
              setBall(msg.ball);
              setScoreA(msg.scoreA);
              setScoreB(msg.scoreB);
              if (msg.teamAName) setTeamAName(msg.teamAName);
              if (msg.teamBName) setTeamBName(msg.teamBName);
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

  function kick() {
    const p = meRef.current;
    const b = ballRef.current;
    const dx = b.x - p.x;
    const dy = b.y - p.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 85) {
      const safe = dist || 1;
      const kickedBall = {
        ...b,
        vx: (dx / safe) * 15,
        vy: (dy / safe) * 15
      };

      if (isHost) {
        setBall(kickedBall);
        broadcastState(kickedBall, scoreA, scoreB);
      } else {
        sendToHost({ type: "kick", player: p });
      }

      playBeep();
    }
  }

  function hitBallWithPlayer(p, currentBall) {
    const dx = currentBall.x - p.x;
    const dy = currentBall.y - p.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 58) {
      const safe = dist || 1;
      return {
        ...currentBall,
        vx: (dx / safe) * 8.5,
        vy: (dy / safe) * 8.5
      };
    }

    return currentBall;
  }

  function moveAi(playersMap, currentBall) {
    if (!playersMap.AI_BOT) return playersMap;

    const ai = playersMap.AI_BOT;
    const targetX = currentBall.x;
    const targetY = currentBall.y;

    const dx = targetX - ai.x;
    const dy = targetY - ai.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;

    const speed = 3.2;

    const nextAi = {
      ...ai,
      x: Math.max(10, Math.min(FIELD_W - 60, ai.x + (dx / dist) * speed)),
      y: Math.max(60, Math.min(FIELD_H - 60, ai.y + (dy / dist) * speed))
    };

    return { ...playersMap, AI_BOT: nextAi };
  }

  useEffect(() => {
    if (screen !== "game" || !isHost) return;

    const loop = setInterval(() => {
      let updatedPlayers = playersRef.current;

      if (aiEnabled) {
        updatedPlayers = moveAi(updatedPlayers, ballRef.current);
        setPlayers(updatedPlayers);
      }

      setBall(prev => {
        let nextBall = {
          x: prev.x + prev.vx,
          y: prev.y + prev.vy,
          vx: prev.vx * 0.992,
          vy: prev.vy * 0.992
        };

        Object.values(updatedPlayers).forEach(p => {
          nextBall = hitBallWithPlayer(p, nextBall);
        });

        if (nextBall.y < 45 || nextBall.y > FIELD_H - BALL_SIZE) {
          nextBall.vy *= -1;
        }

        if (nextBall.x < 0) {
          const newScoreB = scoreB + 1;
          const reset = { x: 370, y: 210, vx: 0, vy: 0 };

          setScoreB(newScoreB);
          broadcastState(reset, scoreA, newScoreB, updatedPlayers);
          showGoal("GOAL " + teamBName);
          return reset;
        }

        if (nextBall.x > FIELD_W) {
          const newScoreA = scoreA + 1;
          const reset = { x: 370, y: 210, vx: 0, vy: 0 };

          setScoreA(newScoreA);
          broadcastState(reset, newScoreA, scoreB, updatedPlayers);
          showGoal("GOAL " + teamAName);
          return reset;
        }

        broadcastState(nextBall, scoreA, scoreB, updatedPlayers);
        return nextBall;
      });
    }, 16);

    return () => clearInterval(loop);
  }, [screen, isHost, scoreA, scoreB, aiEnabled]);

  useEffect(() => {
    if (screen !== "game" || isHost) return;

    const pinger = setInterval(() => {
      const now = Date.now();
      pingStartRef.current = now;
      sendToHost({ type: "ping", t: now });
    }, 1200);

    return () => clearInterval(pinger);
  }, [screen, isHost]);

  useEffect(() => {
    if (screen !== "game") return;

    const moveLoop = setInterval(() => {
      if (joy.dx === 0 && joy.dy === 0) return;

      const current = meRef.current;
      const next = {
        ...current,
        name: playerName,
        team,
        x: Math.max(10, Math.min(FIELD_W - 60, current.x + joy.dx * 5.5)),
        y: Math.max(60, Math.min(FIELD_H - 60, current.y + joy.dy * 5.5))
      };

      setMe(next);
      meRef.current = next;

      setPlayers(prev => {
        const updated = { ...prev, [next.id]: next };
        playersRef.current = updated;
        return updated;
      });

      if (isHost) {
        broadcastState(ballRef.current, scoreA, scoreB, {
          ...playersRef.current,
          [next.id]: next
        });
      } else {
        sendToHost({ type: "move", player: next });
      }
    }, 16);

    return () => clearInterval(moveLoop);
  }, [screen, joy, isHost, scoreA, scoreB, playerName, team]);

  if (screen === "menu") {
    return (
      <View style={styles.menu}>
        <Text style={styles.title}>MC24 Laghouat</Text>

        <View style={styles.roomBox}>
          <TextInput
            style={styles.input}
            value={roomName}
            onChangeText={setRoomName}
            placeholder="Room name"
            placeholderTextColor="#777"
          />
        </View>

        <View style={styles.row}>
          <TouchableOpacity
            style={[styles.teamBtn, team === "A" && styles.teamAActive]}
            onPress={() => setTeam("A")}
          >
            <Text style={styles.buttonText}>Team A</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.teamBtn, team === "B" && styles.teamBActive]}
            onPress={() => setTeam("B")}
          >
            <Text style={styles.buttonText}>Team B</Text>
          </TouchableOpacity>
        </View>

        <TextInput style={styles.input} value={playerName} onChangeText={setPlayerName} placeholder="Player name" />
        <TextInput style={styles.input} value={teamAName} onChangeText={setTeamAName} placeholder="Team A name" />
        <TextInput style={styles.input} value={teamBName} onChangeText={setTeamBName} placeholder="Team B name" />

        <TouchableOpacity style={styles.aiBtn} onPress={() => setAiEnabled(!aiEnabled)}>
          <Text style={styles.buttonText}>AI Bot: {aiEnabled ? "ON" : "OFF"}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.button} onPress={startHost}>
          <Text style={styles.buttonText}>Create Room / Host</Text>
        </TouchableOpacity>

        <TextInput
          style={styles.input}
          value={hostIp}
          onChangeText={setHostIp}
          placeholder="Host IP مثل 192.168.43.1"
          placeholderTextColor="#777"
        />

        <TouchableOpacity style={styles.button} onPress={joinHost}>
          <Text style={styles.buttonText}>Join Room</Text>
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

      <Text style={styles.ping}>
        {isHost ? "HOST" : `PING ${ping}ms`}
      </Text>

      <View style={styles.centerLine} />
      <View style={styles.centerCircle} />
      <View style={styles.goalLeft} />
      <View style={styles.goalRight} />

      <View style={[styles.ball, { left: ball.x, top: ball.y }]} />

      {Object.values(players).map(p => (
        <View
          key={p.id}
          style={[
            styles.player,
            {
              left: p.x,
              top: p.y,
              backgroundColor: playerColor(p.team),
              opacity: p.ai ? 0.75 : 1
            }
          ]}
        >
          <Text style={styles.playerText}>
            {(p.name || "P").slice(0, 2).toUpperCase()}
          </Text>
        </View>
      ))}

      {goalFlash !== "" && (
        <View style={styles.goalFlash}>
          <Text style={styles.goalText}>{goalFlash}</Text>
        </View>
      )}

      <View style={styles.joystick}>
        <TouchableOpacity onPressIn={() => setJoy({ dx: 0, dy: -1 })} onPressOut={() => setJoy({ dx: 0, dy: 0 })}>
          <Text style={styles.joyBtn}>↑</Text>
        </TouchableOpacity>

        <View style={{ flexDirection: "row" }}>
          <TouchableOpacity onPressIn={() => setJoy({ dx: -1, dy: 0 })} onPressOut={() => setJoy({ dx: 0, dy: 0 })}>
            <Text style={styles.joyBtn}>←</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={kick}>
            <Text style={styles.kickBtn}>KICK</Text>
          </TouchableOpacity>

          <TouchableOpacity onPressIn={() => setJoy({ dx: 1, dy: 0 })} onPressOut={() => setJoy({ dx: 0, dy: 0 })}>
            <Text style={styles.joyBtn}>→</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity onPressIn={() => setJoy({ dx: 0, dy: 1 })} onPressOut={() => setJoy({ dx: 0, dy: 0 })}>
          <Text style={styles.joyBtn}>↓</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.backBtn} onPress={() => setScreen("menu")}>
        <Text style={styles.buttonText}>Menu</Text>
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
    fontSize: 36,
    fontWeight: "bold",
    marginBottom: 8
  },
  roomBox: {
    marginBottom: 4
  },
  row: {
    flexDirection: "row",
    marginBottom: 6
  },
  teamBtn: {
    width: 130,
    backgroundColor: "#111",
    padding: 11,
    borderRadius: 14,
    alignItems: "center",
    marginHorizontal: 5,
    borderWidth: 2,
    borderColor: "#555"
  },
  teamAActive: {
    backgroundColor: TEAM_A_COLOR,
    borderColor: "white"
  },
  teamBActive: {
    backgroundColor: TEAM_B_COLOR,
    borderColor: "white"
  },
  input: {
    width: 285,
    backgroundColor: "white",
    padding: 10,
    borderRadius: 12,
    marginVertical: 4
  },
  button: {
    width: 285,
    backgroundColor: "#111",
    padding: 12,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 6
  },
  aiBtn: {
    width: 285,
    backgroundColor: "#444",
    padding: 12,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 6
  },
  buttonText: {
    color: "white",
    fontWeight: "bold"
  },
  status: {
    color: "white",
    marginTop: 8
  },
  field: {
    flex: 1,
    backgroundColor: "#1f7a3d",
    borderWidth: 4,
    borderColor: "white"
  },
  score: {
    position: "absolute",
    top: 10,
    alignSelf: "center",
    color: "white",
    fontSize: 18,
    fontWeight: "bold",
    zIndex: 10,
    backgroundColor: "rgba(0,0,0,0.38)",
    paddingHorizontal: 18,
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
    backgroundColor: "rgba(0,0,0,0.45)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8
  },
  centerLine: {
    position: "absolute",
    left: "50%",
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: "white",
    opacity: 0.85
  },
  centerCircle: {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: 130,
    height: 130,
    marginLeft: -65,
    marginTop: -65,
    borderRadius: 65,
    borderWidth: 2,
    borderColor: "white",
    opacity: 0.85
  },
  goalLeft: {
    position: "absolute",
    left: 0,
    top: "36%",
    width: 14,
    height: 125,
    backgroundColor: "white"
  },
  goalRight: {
    position: "absolute",
    right: 0,
    top: "36%",
    width: 14,
    height: 125,
    backgroundColor: "white"
  },
  ball: {
    position: "absolute",
    width: BALL_SIZE,
    height: BALL_SIZE,
    borderRadius: BALL_SIZE / 2,
    backgroundColor: "white",
    borderWidth: 2,
    borderColor: "#111",
    zIndex: 4
  },
  player: {
    position: "absolute",
    width: PLAYER_SIZE,
    height: PLAYER_SIZE,
    borderRadius: PLAYER_SIZE / 2,
    borderWidth: 2,
    borderColor: "#111",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 5
  },
  playerText: {
    color: "#111",
    fontWeight: "bold"
  },
  goalFlash: {
    position: "absolute",
    top: "38%",
    alignSelf: "center",
    backgroundColor: "rgba(0,0,0,0.72)",
    paddingHorizontal: 40,
    paddingVertical: 18,
    borderRadius: 18,
    zIndex: 50
  },
  goalText: {
    color: "white",
    fontSize: 34,
    fontWeight: "bold"
  },
  joystick: {
    position: "absolute",
    bottom: 18,
    left: 18,
    alignItems: "center",
    zIndex: 30
  },
  joyBtn: {
    backgroundColor: "#000",
    color: "#fff",
    fontSize: 22,
    width: 46,
    height: 40,
    textAlign: "center",
    paddingTop: 5,
    margin: 4,
    borderRadius: 10,
    overflow: "hidden"
  },
  kickBtn: {
    backgroundColor: "#fdd835",
    color: "#111",
    fontSize: 15,
    fontWeight: "bold",
    width: 70,
    height: 40,
    textAlign: "center",
    paddingTop: 10,
    margin: 4,
    borderRadius: 10,
    overflow: "hidden"
  },
  backBtn: {
    position: "absolute",
    right: 10,
    bottom: 10,
    backgroundColor: "#111",
    padding: 10,
    borderRadius: 10,
    zIndex: 20
  }
});
