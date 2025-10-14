import { computeWsUrl } from "../components/ws";

describe("computeWsUrl", () => {
  const origWindow = global.window;

  afterEach(() => {
    // reset window
    // @ts-ignore
    global.window = origWindow;
  });

  it("builds dev URL to backend on localhost:8000", () => {
    // @ts-ignore
    global.window = {
      location: {
        protocol: "http:",
        hostname: "localhost",
        port: "3000",
        host: "localhost:3000",
      },
    };
    const url = computeWsUrl("/ws/leaderboard");
    expect(url).toBe("ws://localhost:8000/ws/leaderboard");
  });

  it("builds production URL on same host with wss when https", () => {
    // @ts-ignore
    global.window = {
      location: {
        protocol: "https:",
        hostname: "ctf.example.com",
        port: "",
        host: "ctf.example.com",
      },
    };
    const url = computeWsUrl("/ws/leaderboard");
    expect(url).toBe("wss://ctf.example.com/ws/leaderboard");
  });

  it("falls back to localhost:8000 in non-browser environments", () => {
    // @ts-ignore
    global.window = undefined;
    const url = computeWsUrl("/ws/leaderboard");
    expect(url).toBe("ws://localhost:8000/ws/leaderboard");
  });
});