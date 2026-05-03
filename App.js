import React, { useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  PanResponder,
  Alert
} from "react-native";

import TcpSocket from "react-native-tcp-socket";

const PORT = 2424;

export default function App() {
  const [screen, setScreen] = useState("menu");
  const [playerName, setPlayerName] = useState("Player");
  const [teamName, setTeamName] = useState("MC24");
  const [hostIp, setHostIp] = useState("");
  const [status, setStatus] = useState("Offline");

  const [players, setPlayers] = useState({});
  const [me, setMe] = useState({
    id: String(Date.now()),
    x: 120,
    y: 220,
    color: "#e53935"
  });

  const serverRef = useRef(null);
  const clientsRef = useRef([]);
  const socketRef = useRef(null);

  function sendAll(data) {
    const msg = JSON.stringify(data) + "\n";
    clientsRef.current.forEach(s => {
      try {
        s.write(msg);
      } catch {}
    });
  }

  function startHost() {
    try {
      const server = TcpSocket.createServer(socket => {
        clientsRef.current.push(socket);

        socket.on("data", data => {
          try {
            const msg = JSON.parse(data.toString());
            if (msg.type === "move") {
              setPlayers(prev => ({
                ...prev,
                [msg.id]: msg.player
              }));
              sendAll(msg);
            }
          } catch {}
        });

        socket.on("close", () => {
          clientsRef.current = clientsRef.current.filter(s => s !== socket);
        });
      });

      server.listen({ port: PORT, host: "0.0.0.0" }, () => {
        setStatus("Host started - port " + PORT);
        setScreen("game");
      });

      serverRef.current = server;
    } catch (e) {
      Alert.alert("Host error", String(e));
    }
  }

  function joinHost() {
    try {
      const socket = TcpSocket.createConnection(
        { port: PORT, host: hostIp },
        () => {
          socketRef.current = socket;
          setStatus("Connected to host");
          setScreen("game");
        }
      );

      socket.on("data", data => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === "move") {
            setPlayers(prev => ({
              ...prev,
              [msg.id]: msg.player
            }));
          }
        } catch {}
      });

      socket.on("error", e => {
        Alert.alert("Connection error", String(e));
      });
    } catch (e) {
      Alert.alert("Join error", String(e));
    }
  }

  function sendMove(nextMe) {
    const msg = {
      type: "move",
      id: nextMe.id,
      player: {
        ...nextMe,
        name: playerName,
        team: teamName
      }
    };

    if (socketRef.current) {
      try {
        socketRef.current.write(JSON.stringify(msg) + "\n");
      } catch {}
    }

    sendAll(msg);
  }

  const last = useRef({ x: 120, y: 220 });

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: (_, g) => {
        const next = {
          ...me,
          x: Math.max(10, Math.min(720, last.current.x + g.dx)),
          y: Math.max(40, Math.min(420, last.current.y + g.dy))
        };

        setMe(next);
        sendMove(next);
      },
      onPanResponderRelease: (_, g) => {
        last.current = {
          x: Math.max(10, Math.min(720, last.current.x + g.dx)),
          y: Math.max(40, Math.min(420, last.current.y + g.dy))
        };
      }
    })
  ).current;

  if (screen === "menu") {
    return (
      <View style={styles.menu}>
        <Text style={styles.title}>MC24 Laghouat</Text>

        <TextInput
          style={styles.input}
          value={playerName}
          onChangeText={setPlayerName}
          placeholder="Player name"
        />

        <TextInput
          style={styles.input}
          value={teamName}
          onChangeText={setTeamName}
          placeholder="Team name"
        />

        <TouchableOpacity style={styles.button} onPress={startHost}>
          <Text style={styles.buttonText}>Create WiFi Match</Text>
        </TouchableOpacity>

        <TextInput
          style={styles.input}
          value={hostIp}
          onChangeText={setHostIp}
          placeholder="Host IP مثل 192.168.43.1"
        />

        <TouchableOpacity style={styles.button} onPress={joinHost}>
          <Text style={styles.buttonText}>Join WiFi Match</Text>
        </TouchableOpacity>

        <Text style={styles.status}>{status}</Text>
      </View>
    );
  }

  return (
    <View style={styles.field}>
      <Text style={styles.score}>{teamName} - WiFi Local</Text>

      <View style={styles.centerLine} />
      <View style={styles.centerCircle} />
      <View style={styles.ball} />

      {Object.values(players).map(p => (
        <View
          key={p.id}
          style={[
            styles.player,
            { left: p.x, top: p.y, backgroundColor: p.color || "#1e88e5" }
          ]}
        >
          <Text style={styles.playerText}>
            {(p.name || "P").slice(0, 2).toUpperCase()}
          </Text>
        </View>
      ))}

      <View
        {...panResponder.panHandlers}
        style={[
          styles.player,
          { left: me.x, top: me.y, backgroundColor: me.color }
        ]}
      >
        <Text style={styles.playerText}>
          {playerName.slice(0, 2).toUpperCase()}
        </Text>
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
    backgroundColor: "#1f7a3d",
    justifyContent: "center",
    alignItems: "center"
  },
  title: {
    color: "white",
    fontSize: 34,
    fontWeight: "bold",
    marginBottom: 18
  },
  input: {
    width: 280,
    backgroundColor: "white",
    padding: 12,
    borderRadius: 12,
    marginVertical: 6
  },
  button: {
    width: 280,
    backgroundColor: "#111",
    padding: 14,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 8
  },
  buttonText: {
    color: "white",
    fontWeight: "bold"
  },
  status: {
    color: "white",
    marginTop: 12
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
    fontSize: 20,
    fontWeight: "bold"
  },
  centerLine: {
    position: "absolute",
    left: "50%",
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: "white"
  },
  centerCircle: {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: 120,
    height: 120,
    marginLeft: -60,
    marginTop: -60,
    borderRadius: 60,
    borderWidth: 2,
    borderColor: "white"
  },
  ball: {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "white",
    borderWidth: 2,
    borderColor: "#111"
  },
  player: {
    position: "absolute",
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: "#111",
    alignItems: "center",
    justifyContent: "center"
  },
  playerText: {
    color: "#111",
    fontWeight: "bold"
  },
  backBtn: {
    position: "absolute",
    right: 10,
    bottom: 10,
    backgroundColor: "#111",
    padding: 10,
    borderRadius: 10
  }
});
