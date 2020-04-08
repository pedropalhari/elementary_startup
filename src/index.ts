import "source-map-support/register";
import { spawn, exec, ExecException } from "child_process";

(async () => {
  //await spawnAllWindows();

  let windows = await waitForAllWindowsToSpawn();

  let chromeAlreadyPassed = false; //um chrome na esquerda, outro na direita

  for (let i = 0; i < windows.length; i++) {
    let { windowId, windowName } = windows[i];

    if (windowName == "kworker/0:0H-kb") {
      await moveToWorkspaceMonitor({
        windowId,
        monitorNumber: 0,
        workspaceNumber: 0
      });
    }

    if (windowName == "Discord") {
      await moveToWorkspaceMonitor({
        windowId,
        monitorNumber: 1,
        workspaceNumber: 0
      });
    }

    if (windowName == "chrome") {
      await moveToWorkspaceMonitor({
        windowId,
        monitorNumber: chromeAlreadyPassed ? 1 : 0,
        workspaceNumber: 1
      });
      chromeAlreadyPassed = true;
    }

    if (windowName == "io.elementary.t") {
      await moveToWorkspaceMonitor({
        windowId,
        monitorNumber: 0,
        workspaceNumber: 2
      });
    }
  }

  process.exit();
})();

async function spawnAllWindows() {
  return [
    spawn("flatpak", ["run", "com.spotify.Client"], {
      detached: true,
      stdio: ["ignore", "ignore", "ignore"]
    }),
    spawn("discord", {
      detached: true,
      stdio: ["ignore", "ignore", "ignore"]
    }),
    spawn(
      "google-chrome",
      [
        "--new-window",
        "https://web.whatsapp.com/",
        "https://web.telegram.org/#/im",
        "https://mail.google.com/mail/u/0/#inbox"
      ],
      {
        detached: true,
        stdio: ["ignore", , "ignore", "ignore"]
      }
    ),
    spawn("google-chrome", ["--new-window"], {
      detached: true,
      stdio: ["ignore", "ignore", "ignore"]
    })
  ];
}

async function waitForAllWindowsToSpawn() {
  //2 chromes, 1 spotify, 1 discord, 1 terminal
  while (true) {
    let count: { [windowName: string]: number } = {
      chrome: 0,
      Discord: 0,
      "io.elementary.t": 0,
      "kworker/0:0H-kb": 0
    };

    let windows = await getWindows();

    windows.forEach(wind => {
      count[wind.windowName]++;
    });

    console.log(count);

    if (
      count.chrome == 2 &&
      count.Discord == 1 &&
      count["io.elementary.t"] == 1 &&
      count["kworker/0:0H-kb"] == 1
    ) {
      return windows;
    }

    await delay(100);
  }
}

type WindowCommand =
  | "ADD_FULLSCREEN"
  | "REMOVE_FULLSCREEN"
  | "MOVE_TO_WORKSPACE"
  | "MOVE_TO_MONITOR"
  | "MOVE_TO_POSITION";
async function windowCommand(
  windowId: string,
  type: WindowCommand,
  args?: {
    workspaceNumber?: number;
    monitorNumber?: number;
    position?: {
      x: number;
      y: number;
    };
  }
) {
  switch (type) {
    case "ADD_FULLSCREEN":
      return await promisifiedExec(
        `wmctrl -ir ${windowId} -b add,maximized_vert,maximized_horz`
      );

    case "REMOVE_FULLSCREEN":
      return await promisifiedExec(
        `wmctrl -ir ${windowId} -b remove,maximized_vert,maximized_horz`
      );

    case "MOVE_TO_WORKSPACE":
      return await promisifiedExec(
        `wmctrl -ir ${windowId} -t ${args?.workspaceNumber}`
      );

    case "MOVE_TO_MONITOR":
      return await promisifiedExec(
        `wmctrl -ir ${windowId} -e 0,${(args?.monitorNumber as number) *
          1920},0,500,50`
      );

    case "MOVE_TO_POSITION":
      return await promisifiedExec(
        `wmctrl -ir ${windowId} -e 0,${args?.position?.x},${args?.position?.y},300,300`
      );

    default:
      return;
  }
}

async function removeFullscreenFromWindow(windowId: string) {}

async function getWindows() {
  let windowsArray = await (await promisifiedExec("wmctrl -lp")).stdout
    .split("\n")
    .map(row => row.split(" "))
    .map(row => ({
      windowId: row[0],
      windowPID: row[3],
      windowName: ""
    }));

  windowsArray = await Promise.all(
    windowsArray.map(async row => {
      return {
        ...row,
        windowName: await getProcessNameFromPID(row.windowPID)
      };
    })
  );

  const windowNames = [
    "chrome",
    "Discord",
    "io.elementary.t",
    "kworker/0:0H-kb"
    //fodendo spotify
  ];
  windowsArray = windowsArray.filter(window =>
    windowNames.includes(window.windowName)
  );

  return windowsArray;
}

async function getProcessNameFromPID(pid: string) {
  let { stdout } = await promisifiedExec(`ps -p ${pid} -o comm=`);

  stdout = stdout.split("\n")[0];

  return stdout;
}

function promisifiedExec(
  command: string
): Promise<{ error: ExecException | null; stdout: string; stderr: string }> {
  return new Promise(resolve => {
    exec(command, (error, stdout, stderr) => {
      resolve({ error, stdout, stderr });
    });
  });
}

async function delay(ms: number) {
  return new Promise(resolve => {
    setTimeout(() => {
      resolve();
    }, ms);
  });
}

async function moveToWorkspaceMonitor({
  windowId,
  workspaceNumber,
  monitorNumber
}: {
  windowId: string;
  workspaceNumber: number;
  monitorNumber: number;
}) {
  await windowCommand(windowId, "REMOVE_FULLSCREEN"); //as vezes buga ai fica bom
  await windowCommand(windowId, "MOVE_TO_WORKSPACE", {
    workspaceNumber
  });
  await windowCommand(windowId, "MOVE_TO_MONITOR", {
    monitorNumber
  });
  await windowCommand(windowId, "ADD_FULLSCREEN");
}
