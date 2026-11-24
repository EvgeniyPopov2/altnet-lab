"""Сквозные проверки настроек на холсте, в сохранённом черновике и в HTML."""
import base64
import json
from pathlib import Path

PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEklEQVR4nGMoCPpYEPSRAUIBAC2eBs39+OwMAAAAAElFTkSuQmCC"


def fixture(case):
    if case in ("custom-grid", "matrix"):
        return {"title": "Макеты", "blocks": []}
    if case == "popup":
        return {"title":"Окна","blocks":[{"type":"p","id":"homeText","text":"Главная"},{"type":"btn","id":"open","label":"Открыть контакты","href":"#popup-6d5ja5"}],
                "sitePages":{"version":1,"activeId":"home","pages":[{"id":"home","path":"index.html"},
                    {"id":"popup","path":"contact.html","document":{"title":"Контакты","blocks":[{"type":"p","id":"inside","text":"Свяжитесь с нами"}]},
                     "template":{"kind":"popup","enabled":True,"priority":4,"popup":{"triggers":["clicks"],"clicks":2,"devices":["desktop"],"limit":1}}}]}}
    if case == "publishing":
        return {"title":"Медиа","blocks":[{"id":"title","type":"textpath","text":"Звёзды"},{"id":"para","type":"p","text":"Текст статьи"},{"id":"sound","type":"soundcloud","label":"Музыка","track":"https://soundcloud.com/artist/track"}]}
    if case == "classes":
        return {"title":"Классы","blocks":[{"type":"p","id":"first","text":"Первая","styleByBp":{"desktop":{"tc":"#335577","pt":8}}},
                {"type":"p","id":"second","text":"Вторая"}]}
    if case == "loop":
        pages=[{"id":"home","path":"index.html"}]
        for i,(title,term) in enumerate([("Репортаж","Новости"),("Портрет","Фото"),("События","Новости")]):
            pages.append({"id":"p"+str(i),"path":"p"+str(i)+".html","document":{"title":title,"blocks":[],"entry":{"kind":"post","terms":[term]}}})
        return {"title":"Журнал","blocks":[{"id":"loop","type":"loopgrid","filter":True,"pageSize":2,"source":"post"}],
                "sitePages":{"version":1,"activeId":"home","pages":pages}}
    if case == "templates":
        return {"title":"Главная","blocks":[{"id":"main","type":"p","text":"Основная страница"}]}
    if case == "layout":
        return {"title": "Параметры", "blocks": [{"id": "row", "type": "section", "layoutPreset": [2, 1], "layoutCells": [[{"id": "text", "type": "heading", "level": "h2", "text": "Контроль"}], []]}]}
    if case == "library":
        return {"title": "Медиа", "blocks": [{"id": "picture", "type": "img", "cid": ""}, {"id": "gallery", "type": "gallery", "lightbox": True,
                "items": [{"id": "a", "src": PNG, "alt": "Первое", "caption": "Первый кадр"}, {"id": "b", "src": PNG, "alt": "Второе", "caption": "Второй кадр"}]}]}
    return {"title": "Анимация и карта", "blocks": [{"id": "anim", "type": "lottie", "trigger": "click", "caption": "Орбита"},
            {"id": "place", "type": "map", "lat": 55, "lon": 37, "detailMap": True, "label": "Парк"}]}


def upload(call, selector, path):
    root = call("DOM.getDocument", {})["root"]["nodeId"]
    node = call("DOM.querySelector", {"nodeId": root, "selector": selector})["nodeId"]
    assert node, selector
    call("DOM.setFileInputFiles", {"nodeId": node, "files": [str(path.resolve())]})


def run(case, js, wait, call, directory):
    js("""window.editorQA = {
      block(id) {const e=document.querySelector('[data-canvas-block="'+id+'"] .cursor-pointer') ?? document.querySelector('[data-layout-block="'+id+'"]'); e.click()},
      field(label) {return [...document.querySelectorAll('.builder-inspector label')].find(e=>e.querySelector('span')?.textContent===label)?.querySelector('input,select,textarea')},
      change(e,value) {if(!e)throw Error('Нет поля'); const p=e.tagName==='SELECT'?HTMLSelectElement.prototype:e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(p,'value').set.call(e,String(value));e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}))},
      saved(){return JSON.parse(localStorage.getItem('altnet.sitebuilder.v1'))},
      async export(restricted=false){const api=await import('/src/builder/exporter.ts'); const d=this.saved();
        const prepared=(await import('/src/screens/SiteBuilder/siteTemplates.ts')).activePageForBuild(d);
        const html=await (await api.exportSingleHtml(api.adaptFromSiteBuilderDoc(prepared),{bundleAssets:false,restrictExternalMedia:restricted})).text();
        const f=document.createElement('iframe');f.id='export-check';f.style.cssText='width:1100px;height:600px;position:fixed;top:0;left:0;z-index:9999;background:white';
        document.body.append(f);f.srcdoc=restricted?await (await import('/src/core/sites/localPreview.ts')).prepareLocalSite(html):html;},
      doc(){return document.getElementById('export-check')?.contentDocument}
    };""")
    if case == "popup":
        js("editorQA.export(true)")
        wait("!!editorQA.doc()?.querySelector('dialog[data-popup-options]')")
        assert not js("editorQA.doc().querySelector('dialog').open")
        js("editorQA.doc().querySelector('main p').click();editorQA.doc().querySelector('main p').click()")
        wait("editorQA.doc()?.querySelector('dialog[open]')?.textContent.includes('Свяжитесь с нами')")
        assert js("editorQA.doc().activeElement.hasAttribute('data-popup-close')")
        assert js("getComputedStyle(editorQA.doc().querySelector('dialog')).backgroundColor==='rgb(18, 20, 28)' && getComputedStyle(editorQA.doc().querySelector('dialog')).color==='rgb(231, 233, 240)'")
        js("editorQA.doc().querySelector('[data-popup-close]').click()")
        wait("!editorQA.doc().querySelector('dialog').open")
        assert js("editorQA.doc().querySelector('main a').getAttribute('href')==='#'+editorQA.doc().querySelector('dialog').id")
        js("const a=editorQA.doc().querySelector('main a');a.focus();a.click()")
        wait("editorQA.doc().querySelector('dialog').open")
        js("editorQA.doc().querySelector('[data-popup-close]').click()")
        wait("editorQA.doc().activeElement===editorQA.doc().querySelector('main a')")
    elif case == "publishing":
        js("editorQA.block('para')")
        wait("!!editorQA.field('Текст')")
        js("const ta=editorQA.field('Текст');ta.focus();ta.setSelectionRange(0,5);ta.dispatchEvent(new Event('select',{bubbles:true}));document.dispatchEvent(new Event('selectionchange'))")
        wait("""!document.querySelector('button[aria-label="Полужирный"]').disabled""")
        js("""document.querySelector('button[aria-label="Полужирный"]').click()""")
        wait("editorQA.saved().blocks[1].richRuns?.[0].bold===true")
        js("editorQA.block('title')")
        wait("!!editorQA.field('Форма контура')")
        js("editorQA.change(editorQA.field('Форма контура'),'custom')")
        source=Path(directory)/"curve.svg"
        source.write_text('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 100"><path d="M8 73 Q150 5 280 70"/></svg>',encoding="utf-8")
        upload(call,".builder-inspector input[type=file]",source)
        wait("editorQA.saved().blocks[0].d==='M8 73 Q150 5 280 70'")
        js("editorQA.change(editorQA.field('Выравнивание вдоль контура'),'middle')")
        wait("editorQA.saved().blocks[0].align==='middle'")
        js("editorQA.export(true)")
        wait("!!editorQA.doc()?.querySelector('.sb-text-path textPath')")
        assert js("""(()=>{const t=editorQA.doc().querySelector('.sb-text-path textPath');
          return t.getAttribute('startOffset')==='50%' && t.getComputedTextLength()>10 && !!editorQA.doc().getElementById(t.getAttribute('href').slice(1))})()""")
        assert js("editorQA.doc().querySelector('main p strong').textContent")== "Текст"
        assert not js("!!editorQA.doc().querySelector('.sb-audio-card iframe,button[data-soundcloud-player]')")
        js("document.querySelector('#export-check').remove()")
        call("Network.setBlockedURLs",{"urls":["*://w.soundcloud.com/*"]})
        js("editorQA.export()")
        wait("!!editorQA.doc()?.querySelector('button[data-soundcloud-player]')")
        assert not js("!!editorQA.doc().querySelector('.sb-audio-card iframe')")
        js("editorQA.doc().querySelector('button[data-soundcloud-player]').click()")
        wait("editorQA.doc()?.querySelector('.sb-audio-card iframe')?.src.startsWith('https://w.soundcloud.com/player/')")
    elif case == "classes":
        js("editorQA.block('first')")
        wait("!!document.querySelector('.builder-inspector')")
        js("document.querySelector('#inspector-tab-style').click()")
        js("document.querySelector('.sb-style-classes summary').click()")
        js("editorQA.change(document.querySelector('.sb-style-classes input[maxlength]'),'article-title')")
        js("[...document.querySelectorAll('.sb-style-classes button')].find(b=>b.textContent.includes('Перенести оформление')).click()")
        wait("editorQA.saved().styleClasses?.length===1 && !!document.querySelector('.sb-class-editor')")
        js("editorQA.block('second')")
        js("document.querySelector('#inspector-tab-style').click()")
        js("document.querySelector('.sb-style-classes summary').click()")
        js("document.querySelector('.sb-style-classes input[type=checkbox]').click()")
        wait("getComputedStyle(document.querySelector('[data-styled-block=second]')).color==='rgb(51, 85, 119)'")
        js("const c=document.querySelector('.sb-style-classes select');editorQA.change(c,c.options[1].value)")
        wait("!!document.querySelector('.sb-class-editor')")
        js("""editorQA.change([...document.querySelectorAll('.sb-class-editor label')].find(l=>l.querySelector('span')?.textContent==='Цвет текста (HEX)').querySelector('input'),'#884422')""")
        wait("['first','second'].every(id=>getComputedStyle(document.querySelector('[data-styled-block='+id+']')).color==='rgb(136, 68, 34)')")
        js("editorQA.export(true)")
        wait("editorQA.doc()?.querySelectorAll('.sb-global-article-title').length===2")
        assert js("Array.from(editorQA.doc().querySelectorAll('.sb-global-article-title')).every(e=>getComputedStyle(e).color==='rgb(136, 68, 34)')")
    elif case == "matrix":
        palette = "button[draggable=true]:not(:disabled)"
        labels = js("[...new Set(Array.from(document.querySelectorAll("+json.dumps(palette)+")).filter(b=>b.getClientRects().length).map(b=>b.textContent.trim()))]")
        assert labels and "Loop Grid" in labels and "Bio card" in labels, labels
        count = 0
        for label in labels:
            js("[...document.querySelectorAll("+json.dumps(palette)+")].find(b=>b.getClientRects().length && b.textContent.trim()==="+json.dumps(label)+").click()")
            wait("!!document.querySelector('.builder-inspector')")
            count += js("""(async(label)=>{
              const paint=()=>new Promise(resolve=>requestAnimationFrame(()=>resolve()));
              let checked=0;
              for(const theme of ['dark','light']){
                if(document.querySelector('.altnet-builder').dataset.editorTheme!==theme){
                  document.querySelector('button[aria-label$="тему конструктора"]').click(); await paint();
                }
                for(const size of ['Desktop','Tablet','Mobile']){
                  const device=Array.from(document.querySelectorAll('.builder-inspector button')).find(b=>b.textContent===size);
                  device.click(); await paint();
                  if(device.getAttribute('aria-pressed')!=='true')throw Error(label+' '+size);
                  for(const tab of ['content','style','advanced']){
                    const id='inspector-tab-'+tab;
                    document.getElementById(id).click(); await paint();
                    const panel=document.getElementById('inspector-panel');
                    if(panel?.getAttribute('aria-labelledby')!==id || !panel.innerText.trim() || panel.textContent.includes('редактор Content будет добавлен'))
                      throw Error([label,theme,size,tab].join(' / '));
                    checked++;
                  }
                }
              }
              const id=document.querySelector('[aria-label="Внутренний идентификатор блока"]').value;
              for(const [size,padding] of [['Desktop',7],['Mobile',11]]){
                Array.from(document.querySelectorAll('.builder-inspector button')).find(b=>b.textContent===size).click();
                await paint();
                const input=document.querySelector('[aria-label="Внутренний отступ сверху"]');
                if(!input)throw Error(label+' '+size+' · отсутствует настройка отступа');
                editorQA.change(input,padding);await paint();
                const styled=document.querySelector('[data-styled-block="'+id+'"]');
                if(!styled || getComputedStyle(styled).paddingTop!==padding+'px')throw Error(label+' '+size+' · отступ холста');
              }
              return checked;
            })(""" + json.dumps(label) + ")")
            js("[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Все виджеты').click()")
            wait("!!document.querySelector("+json.dumps(palette)+")")
        wait("editorQA.saved().blocks.length==="+str(len(labels))+" && editorQA.saved().blocks.every(b=>b.styleByBp?.desktop?.pt===7 && b.styleByBp?.mobile?.pt===11)")
        print(f"PASS {len(labels)} palette entries, {count} widget/theme/device/tab combinations, {2*len(labels)} responsive edits on the canvas and in storage")
    elif case == "custom-grid":
        js("""document.querySelector('[title="Добавить секцию"]').click()""")
        js("[...document.querySelectorAll('button')].find(b=>b.textContent.trim().startsWith('CSS Grid')).click()")
        js("document.querySelector('.sb-custom-layout summary').click()")
        js("editorQA.change(document.querySelector('.sb-custom-layout select'),8)")
        wait("document.querySelectorAll('.sb-custom-weights input').length===8")
        js("editorQA.change(document.querySelectorAll('.sb-custom-layout select')[1],5)")
        js("editorQA.change(document.querySelector('.sb-custom-weights input'),3)")
        wait("document.querySelector('[data-custom-layout-preview]').childElementCount===40")
        assert js("""(()=>{const [a,b]=document.querySelector('[data-custom-layout-preview]').children;
          return a.getBoundingClientRect().width>b.getBoundingClientRect().width*2.8})()""")
        js("document.querySelector('.sb-custom-layout button').click()")
        wait("document.querySelectorAll('[data-layout-cell]').length===40 && editorQA.saved().blocks[0].layoutCells.length===40")
        assert js("editorQA.saved().blocks[0].layoutPreset")==[3,1,1,1,1,1,1,1]*5
    elif case == "layout":
        js("editorQA.block('row')")
        wait("!!editorQA.field('Направление элементов')")
        for field, value in [("Направление элементов", "row-reverse"), ("Вдоль основной оси", "space-evenly"),
                             ("Перенос элементов", "wrap"), ("Поперёк основной оси", "center"), ("Размер ячеек", "fixed")]:
            js("editorQA.change(editorQA.field(" + json.dumps(field) + ")," + json.dumps(value) + ")")
        js("editorQA.change(editorQA.field('Базовый размер ячейки, px'),120)")
        wait("document.querySelector('[data-layout-kind=flex]').style.flexDirection==='row-reverse' && document.querySelector('[data-layout-cell]').style.flexBasis==='120px'")
        js("document.querySelector('#inspector-tab-advanced').click()")
        js("editorQA.change(document.querySelector('[aria-label=\"Внутренний отступ — единица\"]'),'em')")
        js("editorQA.change(document.querySelector('[aria-label=\"Внутренний отступ сверху\"]'),1.5)")
        js("document.querySelector('.sb-transform-controls summary').click()")
        js("editorQA.change(document.querySelector('[aria-label=\"Поворот Z (deg)\"]'),5)")
        js("[...document.querySelectorAll('.builder-inspector summary')].find(e=>e.textContent==='Расположение и переполнение').click()")
        js("editorQA.change(document.querySelector('[aria-label=\"Переполнение\"]'),'hidden')")
        js("editorQA.change(document.querySelector('[aria-label=\"Указатель мыши\"]'),'pointer')")
        js("editorQA.change(document.querySelector('[aria-label=\"Порядок наложения\"]'),3)")
        wait("editorQA.saved().blocks[0].styleByBp?.desktop.rotate===5 && editorQA.saved().blocks[0].styleByBp.desktop.layerOrder===3")
        assert js("getComputedStyle(document.querySelector('[data-styled-block=row]')).overflow==='hidden' && getComputedStyle(document.querySelector('[data-styled-block=row]')).zIndex==='3'")
        assert js("['Top','Right','Bottom','Left'].every(x=>document.querySelector('[data-styled-block=row]').style['padding'+x]==='1.5em')")
        js("editorQA.export()")
        wait("!!editorQA.doc()?.querySelector('.layout-cell')")
        assert js("""(()=>{const doc=editorQA.doc(),cell=doc.querySelector('.layout-cell'),row=getComputedStyle(cell.parentElement);
          const block=getComputedStyle(doc.querySelector('.sb-style-0'));
          return row.display==='flex' && row.flexDirection==='row-reverse' && row.justifyContent==='space-evenly' && getComputedStyle(cell).flexBasis==='120px' && block.transform!=='none' && block.overflow==='hidden' && block.zIndex==='3' && block.cursor==='pointer'})()""")
    elif case == "library":
        js("editorQA.block('picture')")
        wait("!!document.querySelector('.builder-inspector input[type=file]')")
        # Файл с устройства проходит настоящий путь декодирования и очистки на canvas.
        source = Path(directory) / "sample.png"
        source.write_bytes(base64.b64decode(PNG.split(",")[1]))
        upload(call, ".builder-inspector input[type=file]", source)
        wait("editorQA.saved().mediaLibrary?.length===1 && !!editorQA.saved().blocks[0].mediaId")
        js("document.querySelector('.builder-inspector .sb-media-open').click()")
        wait("!!document.querySelector('.sb-media-dialog[open] .sb-media-fields')")
        js("editorQA.change(document.querySelector('.sb-media-dialog[open] .sb-media-fields textarea'),'Тестовая подпись')")
        js("document.querySelector('[aria-label=\"Закрыть медиатеку\"]').click()")
        js("editorQA.change(editorQA.field('Источник подписи'),'media')")
        js("editorQA.change(editorQA.field('Действие при нажатии'),'media')")
        wait("document.querySelector('[data-styled-block=picture] figcaption')?.textContent==='Тестовая подпись' && editorQA.saved().blocks[0].linkTo==='media'")
        js("editorQA.export(true)")
        wait("!!editorQA.doc()?.querySelector('[data-lightbox-group] button')")
        js("editorQA.doc().querySelector('[data-lightbox-group] button').click()")
        wait("editorQA.doc()?.querySelector('dialog[open] .sb-lightbox-caption')?.textContent==='Первый кадр'")
        js("const dial=editorQA.doc().querySelector('dialog');dial.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}))")
        wait("editorQA.doc().querySelector('.sb-lightbox-caption').textContent==='Второй кадр'")
        js("[...editorQA.doc().querySelectorAll('dialog button')].find(b=>b.textContent==='Масштаб 100%').click()")
        assert js("editorQA.doc().querySelector('.sb-lightbox-stage').dataset.zoomed==='true'")
        js("[...editorQA.doc().querySelectorAll('dialog button')].find(b=>b.textContent==='Закрыть').click()")
        wait("!editorQA.doc().querySelector('dialog').open && editorQA.doc().activeElement===editorQA.doc().querySelector('[data-lightbox-group] button')")
    elif case == "loop":
        js("editorQA.block('loop')")
        wait("!!editorQA.field('Источник цикла')")
        js("editorQA.change(editorQA.field('Карточек на странице'),1)")
        js("editorQA.change(editorQA.field('Колонки на выбранном экране'),4)")
        wait("editorQA.saved().blocks[0].pageSize===1 && editorQA.saved().blocks[0].columns?.desktop===4")
        js("editorQA.export(true)")
        wait("!!editorQA.doc()?.querySelector('[data-loop-next]')")
        assert js("editorQA.doc().querySelector('[data-loop-list] article:not([hidden]) h3').textContent")== "Репортаж"
        js("editorQA.doc().querySelector('[data-loop-next]').click()")
        wait("editorQA.doc().querySelector('[data-loop-list] article:not([hidden]) h3').textContent==='Портрет'")
        js("const select=editorQA.doc().querySelector('[data-loop-filter]');select.value='Новости';select.dispatchEvent(new Event('change',{bubbles:true}))")
        wait("editorQA.doc().querySelector('[data-loop-size] [role=status]').textContent==='1 / 2'")
        js("editorQA.doc().querySelector('[data-loop-next]').click()")
        wait("editorQA.doc().querySelector('[data-loop-list] article:not([hidden]) h3').textContent==='События'")
    elif case == "templates":
        js("document.querySelector('.sb-template-panel summary').click()")
        js("editorQA.change(document.querySelector('.sb-template-panel input:not([type])'),'Навигация')")
        js("[...document.querySelectorAll('.sb-template-panel button')].find(b=>b.textContent==='Создать шаблон').click()")
        wait("editorQA.saved().title==='Навигация' && !!document.querySelector('.sb-template-panel fieldset')")
        js("[...document.querySelectorAll('.sb-template-panel label')].find(l=>l.textContent.includes('Использовать на сайте')).querySelector('input').click()")
        js("[...document.querySelectorAll('button[draggable=true]')].find(b=>b.textContent.trim()==='Heading').click()")
        wait("editorQA.saved().blocks.length===1 && !!document.querySelector('.builder-inspector')")
        js("[...document.querySelectorAll('button')].find(b=>b.textContent==='Все виджеты').click()")
        js("document.querySelector('section[aria-label=\"Страницы сайта\"] ul button').click()")
        wait("editorQA.saved().title==='Главная' && !!document.querySelector('[data-theme-area=header] [data-heading-text]')")
        js("editorQA.export(true)")
        wait("!!editorQA.doc()?.querySelector('header[data-site-template=header] h2')")
        assert js("editorQA.doc().querySelector('main').innerText.includes('Основная страница')")
    else:
        js("editorQA.block('anim')")
        wait("!!document.querySelector('.builder-inspector input[accept*=json]')")
        transform = {"o":{"a":0,"k":100},"r":{"a":0,"k":0},"p":{"a":1,"k":[{"t":0,"s":[20,30],"e":[70,30],"i":{"x":[0.67],"y":[1]},"o":{"x":[0.33],"y":[0]}},{"t":30,"s":[70,30]}]},
                     "a":{"a":0,"k":[0,0]},"s":{"a":0,"k":[100,100]}}
        anim = {"v":"5.10.0","w":100,"h":100,"fr":30,"ip":0,"op":60,"layers":[{"ty":1,"ind":1,"sw":16,"sh":16,"sc":"#6655ee","ip":0,"op":60,"st":0,"sr":1,"ks":transform}]}
        source = Path(directory) / "motion.json"
        source.write_text(json.dumps(anim),encoding="utf-8")
        upload(call,".builder-inspector input[accept*=json]",source)
        wait("editorQA.saved().blocks[0].animationJson && !!document.querySelector('[data-styled-block=anim] iframe')")
        js("editorQA.block('place')")
        wait("!!editorQA.field('Название места')")
        js("editorQA.change(editorQA.field('Название места'),'Новая метка')")
        wait("editorQA.saved().blocks[1].label==='Новая метка'")
        js("editorQA.export(true)")
        wait("!!editorQA.doc()?.querySelector('[data-animation-stage] svg rect')")
        assert js("!!editorQA.doc().querySelector('.sb-map svg') && !editorQA.doc().querySelector('iframe[src],button[data-map-open]')")
        frame = "editorQA.doc().querySelector('[data-animation-stage] svg g[transform]')"
        wait("!!"+frame)
        before = js(frame+".getAttribute('transform')")
        js("editorQA.doc().querySelector('[data-animation-command]').click()")
        wait("editorQA.doc().querySelector('[data-animation-command]').getAttribute('aria-pressed')==='true' && "+frame+".getAttribute('transform')!=="+json.dumps(before))
        js("editorQA.doc().querySelector('[data-animation-command]').click()")
        assert js("editorQA.doc().querySelector('[data-animation-command]').getAttribute('aria-pressed')==='false'")
    print("PASS Проверка редактора и опубликованной страницы",case)
