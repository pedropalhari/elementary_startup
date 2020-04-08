import "source-map-support/register";
import { spawn, exec, ExecException } from "child_process";

/**
 * Spawna as janelas, espera todas elas aparecerem, pega o id delas junto com os nomes dos processos, modifica elas de acordo
 */
(async () => {
  await spawnAllWindows(); //spawna

  let windows = await waitForAllWindowsToSpawn(); //espera aparecer (contagem, pode ter repetidas)

  let chromeAlreadyPassed = false; //um chrome na esquerda, outro na direita

  //modifica
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

/**
 * Função que spawna as janelas
 */
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

/**
 * Função que espera as janelas spawnarem, contando a cada 100ms se
 *  já apareceram as janelas dos processos que eu quero
 */
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

/**
 * Função que engloba a lib wmctrl para deixar mais fácil de eu executar os comandos dela
 * @param windowId
 * @param type
 * @param args
 */
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

/**
 * Função de ajuda que junta vários comandos de tela para fazer o que eu quero em uma função só.
 * Tem que minimizar pra mover o monitor, então minimiza -> move workspace e monitor -> maximiza
 * @param param0
 */
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

/**
 * Função que retorna todas as janelas, com filtro, que já foram spawnadas
 */
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

/**
 * Função de ajuda pra pegar o nome do processo pelo PID
 * @param pid
 */
async function getProcessNameFromPID(pid: string) {
  let { stdout } = await promisifiedExec(`ps -p ${pid} -o comm=`);

  stdout = stdout.split("\n")[0];

  return stdout;
}

/**
 * Promisifiquei a função `exec`
 * @param command
 */
function promisifiedExec(
  command: string
): Promise<{ error: ExecException | null; stdout: string; stderr: string }> {
  return new Promise(resolve => {
    exec(command, (error, stdout, stderr) => {
      resolve({ error, stdout, stderr });
    });
  });
}

/**
 * Delayzinho maroto
 * @param ms
 */
async function delay(ms: number) {
  return new Promise(resolve => {
    setTimeout(() => {
      resolve();
    }, ms);
  });
}
