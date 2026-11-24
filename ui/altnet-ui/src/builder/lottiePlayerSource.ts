import vendor from "lottie-web/build/player/lottie_light.min.js?raw";
import license from "lottie-web/LICENSE.md?raw";
import controller from "./lottie-controller.js?raw";

export default ["/*\n" + license.trim() + "\n*/", vendor.trim(), controller.trim()].join("\n").replace(/\r\n?/g, "\n");
