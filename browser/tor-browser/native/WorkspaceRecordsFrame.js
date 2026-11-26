/* Внутренний код Gecko. Страницы сайтов и вложенные документы не получают интерфейс приложения. */
if (!this.altNetRecordsFrameLoaded) {
  this.altNetRecordsFrameLoaded = true;
  let next = 0;
  const pending = new Map();
  function install(doc) {
    const win = doc?.defaultView;
    if (!win || win !== content || win !== win.top || doc.nodePrincipal.isSystemPrincipal ||
        doc.nodePrincipal.originNoSuffix !== "resource://altnet-workspace" ||
        !/^resource:\/\/altnet-workspace\/index\.html(?:$|#altnet-(?:view|open)\?)/.test(doc.documentURI)) return;
    const inner = win.windowGlobalChild.innerWindowId;
    const page = win.wrappedJSObject;
    if (Object.hasOwn(page, "altNetRecords")) return;
    function current() {
      return win === content && doc === content.document && win.windowGlobalChild?.innerWindowId === inner;
    }
    function local(op, key, value) {
      if (!current()) throw new Error("Закрытая страница");
      const [reply] = sendSyncMessage("AltNet:Local", { inner,op,key,value });
      if (!reply?.ok) throw new Error("Личное хранилище AltNet недоступно");
      return reply.value;
    }
    const storage = Cu.createObjectIn(win);
    for (const [name, fn] of Object.entries({
      getItem: key => local("get", String(key)), setItem: (key,value) => {local("set",String(key),String(value));},
      removeItem: key => {local("remove",String(key));}, key: index => local("key", Number(index)),
    })) Cu.exportFunction(fn, storage, {defineAs:name});
    Object.defineProperty(Cu.waiveXrays(storage),"length",{get:Cu.exportFunction(()=>local("length"),win)});
    Object.defineProperty(page,"localStorage",{value:storage, configurable:false});
    const api = Cu.createObjectIn(win);
    Object.defineProperty(Cu.waiveXrays(api),"linuxSites",{value:Services.appinfo.OS === "Linux"});
    Cu.exportFunction((bucket, changes) => {
      if (!current() || typeof bucket !== "string") throw new Error("Закрытая страница");
      return new win.Promise((resolve,reject) => {
        if (pending.size >= 32) { reject(new win.Error("Хранилище занято")); return; }
        const id = ++next;
        const timer = win.setTimeout(()=>{
          pending.delete(id);
          reject(new win.Error("Хранилище не ответило"));
        },bucket === "site-transport" ? 135000 : 30000);
        pending.set(id,{win,inner,resolve,reject,timer});
        try { sendAsyncMessage("AltNet:Records",{inner,id,bucket,changes:Cu.waiveXrays(changes)}); }
        catch { win.clearTimeout(timer); pending.delete(id); reject(new win.Error("Некорректный запрос")); }
      });
    },api,{defineAs:"batch"});
    Object.defineProperty(page,"altNetRecords",{value:api,configurable:false});
  }
  addMessageListener("AltNet:RecordsReply", msg=>{
    const {id,inner,ok,value}=msg.data;
    const job=pending.get(id);
    if (!job || job.inner !== inner) return;
    pending.delete(id);
    if (job.win !== content || content.windowGlobalChild?.innerWindowId !== inner) return;
    job.win.clearTimeout(job.timer);
    if (ok) job.resolve(Cu.cloneInto(value,job.win));
    else job.reject(new job.win.Error("Операция не сохранена"));
  });
  addEventListener("DOMWindowCreated", event=>install(event.target),true);
  addEventListener("pagehide", event=>{
    for (const [id, job] of pending) if (job.win.document === event.target) {
      pending.delete(id);
      job.win.clearTimeout(job.timer);
      job.reject(new job.win.Error("Окно закрыто"));
    }
  },true);
}
