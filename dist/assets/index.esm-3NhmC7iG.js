import{g as ut,a as ne,_ as Le,d as lt,E as ft,b as dt,L as pt,c as mt,h as gt,e as ht,C as Tt,r as pe,v as Et}from"./index-DJ8SdKgO.js";import"./index.esm-vQjqo2R-.js";var H,me,x=function(){var t=self.performance&&performance.getEntriesByType&&performance.getEntriesByType("navigation")[0];if(t&&t.responseStart>0&&t.responseStart<performance.now())return t},Oe=function(t){if(document.readyState==="loading")return"loading";var e=x();if(e){if(t<e.domInteractive)return"loading";if(e.domContentLoadedEventStart===0||t<e.domContentLoadedEventStart)return"dom-interactive";if(e.domComplete===0||t<e.domComplete)return"dom-content-loaded"}return"complete"},vt=function(t){var e=t.nodeName;return t.nodeType===1?e.toLowerCase():e.toUpperCase().replace(/^#/,"")},re=function(t,e){var n="";try{for(;t&&t.nodeType!==9;){var r=t,i=r.id?"#"+r.id:vt(r)+(r.classList&&r.classList.value&&r.classList.value.trim()&&r.classList.value.trim().length?"."+r.classList.value.trim().replace(/\s+/g,"."):"");if(n.length+i.length>(e||100)-1)return n||i;if(n=n?i+">"+n:i,r.id)break;t=r.parentNode}}catch(s){}return n},we=-1,_t=function(){return we},w=function(t){addEventListener("pageshow",(function(e){e.persisted&&(we=e.timeStamp,t(e))}),!0)},ie=function(){var t=x();return t&&t.activationStart||0},S=function(t,e){var n=x(),r="navigate";return _t()>=0?r="back-forward-cache":n&&(document.prerendering||ie()>0?r="prerender":document.wasDiscarded?r="restore":n.type&&(r=n.type.replace(/_/g,"-"))),{name:t,value:e===void 0?-1:e,rating:"good",delta:0,entries:[],id:"v4-".concat(Date.now(),"-").concat(Math.floor(8999999999999*Math.random())+1e12),navigationType:r}},P=function(t,e,n){try{if(PerformanceObserver.supportedEntryTypes.includes(t)){var r=new PerformanceObserver((function(i){Promise.resolve().then((function(){e(i.getEntries())}))}));return r.observe(Object.assign({type:t,buffered:!0},n||{})),r}}catch(i){}},b=function(t,e,n,r){var i,s;return function(o){e.value>=0&&(o||r)&&((s=e.value-(i||0))||i===void 0)&&(i=e.value,e.delta=s,e.rating=(function(a,c){return a>c[1]?"poor":a>c[0]?"needs-improvement":"good"})(e.value,n),t(e))}},ae=function(t){requestAnimationFrame((function(){return requestAnimationFrame((function(){return t()}))}))},V=function(t){document.addEventListener("visibilitychange",(function(){document.visibilityState==="hidden"&&t()}))},oe=function(t){var e=!1;return function(){e||(t(),e=!0)}},A=-1,ge=function(){return document.visibilityState!=="hidden"||document.prerendering?1/0:0},z=function(t){document.visibilityState==="hidden"&&A>-1&&(A=t.type==="visibilitychange"?t.timeStamp:0,It())},he=function(){addEventListener("visibilitychange",z,!0),addEventListener("prerenderingchange",z,!0)},It=function(){removeEventListener("visibilitychange",z,!0),removeEventListener("prerenderingchange",z,!0)},Ue=function(){return A<0&&(A=ge(),he(),w((function(){setTimeout((function(){A=ge(),he()}),0)}))),{get firstHiddenTime(){return A}}},se=function(t){document.prerendering?addEventListener("prerenderingchange",(function(){return t()}),!0):t()},Te=[1800,3e3],St=function(t,e){e=e||{},se((function(){var n,r=Ue(),i=S("FCP"),s=P("paint",(function(o){o.forEach((function(a){a.name==="first-contentful-paint"&&(s.disconnect(),a.startTime<r.firstHiddenTime&&(i.value=Math.max(a.startTime-ie(),0),i.entries.push(a),n(!0)))}))}));s&&(n=b(t,i,Te,e.reportAllChanges),w((function(o){i=S("FCP"),n=b(t,i,Te,e.reportAllChanges),ae((function(){i.value=performance.now()-o.timeStamp,n(!0)}))})))}))},Ee=[.1,.25],bt=function(t,e){(function(n,r){r=r||{},St(oe((function(){var i,s=S("CLS",0),o=0,a=[],c=function(f){f.forEach((function(l){if(!l.hadRecentInput){var h=a[0],v=a[a.length-1];o&&l.startTime-v.startTime<1e3&&l.startTime-h.startTime<5e3?(o+=l.value,a.push(l)):(o=l.value,a=[l])}})),o>s.value&&(s.value=o,s.entries=a,i())},u=P("layout-shift",c);u&&(i=b(n,s,Ee,r.reportAllChanges),V((function(){c(u.takeRecords()),i(!0)})),w((function(){o=0,s=S("CLS",0),i=b(n,s,Ee,r.reportAllChanges),ae((function(){return i()}))})),setTimeout(i,0))})))})((function(n){var r=(function(i){var s,o={};if(i.entries.length){var a=i.entries.reduce((function(u,f){return u&&u.value>f.value?u:f}));if(a&&a.sources&&a.sources.length){var c=(s=a.sources).find((function(u){return u.node&&u.node.nodeType===1}))||s[0];c&&(o={largestShiftTarget:re(c.node),largestShiftTime:a.startTime,largestShiftValue:a.value,largestShiftSource:c,largestShiftEntry:a,loadState:Oe(a.startTime)})}}return Object.assign(i,{attribution:o})})(n);t(r)}),e)},Fe=0,q=1/0,F=0,yt=function(t){t.forEach((function(e){e.interactionId&&(q=Math.min(q,e.interactionId),F=Math.max(F,e.interactionId),Fe=F?(F-q)/7+1:0)}))},ke=function(){return H?Fe:performance.interactionCount||0},At=function(){"interactionCount"in performance||H||(H=P("event",yt,{type:"event",buffered:!0,durationThreshold:0}))},E=[],C=new Map,De=0,Mt=function(){var t=Math.min(E.length-1,Math.floor((ke()-De)/50));return E[t]},Be=[],Nt=function(t){if(Be.forEach((function(i){return i(t)})),t.interactionId||t.entryType==="first-input"){var e=E[E.length-1],n=C.get(t.interactionId);if(n||E.length<10||t.duration>e.latency){if(n)t.duration>n.latency?(n.entries=[t],n.latency=t.duration):t.duration===n.latency&&t.startTime===n.entries[0].startTime&&n.entries.push(t);else{var r={id:t.interactionId,latency:t.duration,entries:[t]};C.set(r.id,r),E.push(r)}E.sort((function(i,s){return s.latency-i.latency})),E.length>10&&E.splice(10).forEach((function(i){return C.delete(i.id)}))}}},ce=function(t){var e=self.requestIdleCallback||self.setTimeout,n=-1;return t=oe(t),document.visibilityState==="hidden"?t():(n=e(t),V(t)),n},ve=[200,500],Rt=function(t,e){"PerformanceEventTiming"in self&&"interactionId"in PerformanceEventTiming.prototype&&(e=e||{},se((function(){var n;At();var r,i=S("INP"),s=function(a){ce((function(){a.forEach(Nt);var c=Mt();c&&c.latency!==i.value&&(i.value=c.latency,i.entries=c.entries,r())}))},o=P("event",s,{durationThreshold:(n=e.durationThreshold)!==null&&n!==void 0?n:40});r=b(t,i,ve,e.reportAllChanges),o&&(o.observe({type:"first-input",buffered:!0}),V((function(){s(o.takeRecords()),r(!0)})),w((function(){De=ke(),E.length=0,C.clear(),i=S("INP"),r=b(t,i,ve,e.reportAllChanges)})))})))},M=[],I=[],Y=0,ue=new WeakMap,N=new Map,J=-1,Pt=function(t){M=M.concat(t),ze()},ze=function(){J<0&&(J=ce(Ct))},Ct=function(){N.size>10&&N.forEach((function(o,a){C.has(a)||N.delete(a)}));var t=E.map((function(o){return ue.get(o.entries[0])})),e=I.length-50;I=I.filter((function(o,a){return a>=e||t.includes(o)}));for(var n=new Set,r=0;r<I.length;r++){var i=I[r];xe(i.startTime,i.processingEnd).forEach((function(o){n.add(o)}))}var s=M.length-1-50;M=M.filter((function(o,a){return o.startTime>Y&&a>s||n.has(o)})),J=-1};Be.push((function(t){t.interactionId&&t.target&&!N.has(t.interactionId)&&N.set(t.interactionId,t.target)}),(function(t){var e,n=t.startTime+t.duration;Y=Math.max(Y,t.processingEnd);for(var r=I.length-1;r>=0;r--){var i=I[r];if(Math.abs(n-i.renderTime)<=8){(e=i).startTime=Math.min(t.startTime,e.startTime),e.processingStart=Math.min(t.processingStart,e.processingStart),e.processingEnd=Math.max(t.processingEnd,e.processingEnd),e.entries.push(t);break}}e||(e={startTime:t.startTime,processingStart:t.processingStart,processingEnd:t.processingEnd,renderTime:n,entries:[t]},I.push(e)),(t.interactionId||t.entryType==="first-input")&&ue.set(t,e),ze()}));var xe=function(t,e){for(var n,r=[],i=0;n=M[i];i++)if(!(n.startTime+n.duration<t)){if(n.startTime>e)break;r.push(n)}return r},Lt=function(t,e){me||(me=P("long-animation-frame",Pt)),Rt((function(n){var r=(function(i){var s=i.entries[0],o=ue.get(s),a=s.processingStart,c=o.processingEnd,u=o.entries.sort((function(y,ct){return y.processingStart-ct.processingStart})),f=xe(s.startTime,c),l=i.entries.find((function(y){return y.target})),h=l&&l.target||N.get(s.interactionId),v=[s.startTime+s.duration,c].concat(f.map((function(y){return y.startTime+y.duration}))),U=Math.max.apply(Math,v),st={interactionTarget:re(h),interactionTargetElement:h,interactionType:s.name.startsWith("key")?"keyboard":"pointer",interactionTime:s.startTime,nextPaintTime:U,processedEventEntries:u,longAnimationFrameEntries:f,inputDelay:a-s.startTime,processingDuration:c-a,presentationDelay:Math.max(U-c,0),loadState:Oe(s.startTime)};return Object.assign(i,{attribution:st})})(n);t(r)}),e)},_e=[2500,4e3],$={},Ot=function(t,e){(function(n,r){r=r||{},se((function(){var i,s=Ue(),o=S("LCP"),a=function(f){r.reportAllChanges||(f=f.slice(-1)),f.forEach((function(l){l.startTime<s.firstHiddenTime&&(o.value=Math.max(l.startTime-ie(),0),o.entries=[l],i())}))},c=P("largest-contentful-paint",a);if(c){i=b(n,o,_e,r.reportAllChanges);var u=oe((function(){$[o.id]||(a(c.takeRecords()),c.disconnect(),$[o.id]=!0,i(!0))}));["keydown","click"].forEach((function(f){addEventListener(f,(function(){return ce(u)}),{once:!0,capture:!0})})),V(u),w((function(f){o=S("LCP"),i=b(n,o,_e,r.reportAllChanges),ae((function(){o.value=performance.now()-f.timeStamp,$[o.id]=!0,i(!0)}))}))}}))})((function(n){var r=(function(i){var s={timeToFirstByte:0,resourceLoadDelay:0,resourceLoadDuration:0,elementRenderDelay:i.value};if(i.entries.length){var o=x();if(o){var a=o.activationStart||0,c=i.entries[i.entries.length-1],u=c.url&&performance.getEntriesByType("resource").filter((function(U){return U.name===c.url}))[0],f=Math.max(0,o.responseStart-a),l=Math.max(f,u?(u.requestStart||u.startTime)-a:0),h=Math.max(l,u?u.responseEnd-a:0),v=Math.max(h,c.startTime-a);s={element:re(c.element),timeToFirstByte:f,resourceLoadDelay:l-f,resourceLoadDuration:h-l,elementRenderDelay:v-h,navigationEntry:o,lcpEntry:c},c.url&&(s.url=c.url),u&&(s.lcpResourceEntry=u)}}return Object.assign(i,{attribution:s})})(n);t(r)}),e)};const Ie="@firebase/performance",Q="0.7.9";/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Ve=Q,wt="FB-PERF-TRACE-START",Ut="FB-PERF-TRACE-STOP",Z="FB-PERF-TRACE-MEASURE",qe="_wt_",$e="_fp",je="_fcp",Ge="_fid",Ke="_lcp",Ft="lcp_element",Xe="_inp",kt="inp_interactionTarget",We="_cls",Dt="cls_largestShiftTarget",He="@firebase/performance/config",Ye="@firebase/performance/configexpire",Bt="performance",Je="Performance";/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const zt={"trace started":"Trace {$traceName} was started before.","trace stopped":"Trace {$traceName} is not running.","nonpositive trace startTime":"Trace {$traceName} startTime should be positive.","nonpositive trace duration":"Trace {$traceName} duration should be positive.","no window":"Window is not available.","no app id":"App id is not available.","no project id":"Project id is not available.","no api key":"Api key is not available.","invalid cc log":"Attempted to queue invalid cc event","FB not default":"Performance can only start when Firebase app instance is the default one.","RC response not ok":"RC response is not ok","invalid attribute name":"Attribute name {$attributeName} is invalid.","invalid attribute value":"Attribute value {$attributeValue} is invalid.","invalid custom metric name":"Custom metric name {$customMetricName} is invalid","invalid String merger input":"Input for String merger is invalid, contact support team to resolve.","already initialized":"initializePerformance() has already been called with different options. To avoid this error, call initializePerformance() with the same options as when it was originally called, or call getPerformance() to return the already initialized instance."},p=new ft(Bt,Je,zt);/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const _=new pt(Je);_.logLevel=gt.INFO;/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */let j,Qe;class d{constructor(e){if(this.window=e,!e)throw p.create("no window");this.performance=e.performance,this.PerformanceObserver=e.PerformanceObserver,this.windowLocation=e.location,this.navigator=e.navigator,this.document=e.document,this.navigator&&this.navigator.cookieEnabled&&(this.localStorage=e.localStorage),e.perfMetrics&&e.perfMetrics.onFirstInputDelay&&(this.onFirstInputDelay=e.perfMetrics.onFirstInputDelay),this.onLCP=Ot,this.onINP=Lt,this.onCLS=bt}getUrl(){return this.windowLocation.href.split("?")[0]}mark(e){!this.performance||!this.performance.mark||this.performance.mark(e)}measure(e,n,r){!this.performance||!this.performance.measure||this.performance.measure(e,n,r)}getEntriesByType(e){return!this.performance||!this.performance.getEntriesByType?[]:this.performance.getEntriesByType(e)}getEntriesByName(e){return!this.performance||!this.performance.getEntriesByName?[]:this.performance.getEntriesByName(e)}getTimeOrigin(){return this.performance&&(this.performance.timeOrigin||this.performance.timing.navigationStart)}requiredApisAvailable(){return!fetch||!Promise||!dt()?(_.info("Firebase Performance cannot start if browser does not support fetch and Promise or cookie is disabled."),!1):mt()?!0:(_.info("IndexedDB is not supported by current browser"),!1)}setupObserver(e,n){if(!this.PerformanceObserver)return;new this.PerformanceObserver(i=>{for(const s of i.getEntries())n(s)}).observe({entryTypes:[e]})}static getInstance(){return j===void 0&&(j=new d(Qe)),j}}function xt(t){Qe=t}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */let Ze;function Vt(t){const e=t.getId();return e.then(n=>{Ze=n}),e}function le(){return Ze}function qt(t){const e=t.getToken();return e.then(n=>{}),e}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function Se(t,e){const n=t.length-e.length;if(n<0||n>1)throw p.create("invalid String merger input");const r=[];for(let i=0;i<t.length;i++)r.push(t.charAt(i)),e.length>i&&r.push(e.charAt(i));return r.join("")}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */let G;class m{constructor(){this.instrumentationEnabled=!0,this.dataCollectionEnabled=!0,this.loggingEnabled=!1,this.tracesSamplingRate=1,this.networkRequestsSamplingRate=1,this.logEndPointUrl="https://firebaselogging.googleapis.com/v0cc/log?format=json_proto",this.flTransportEndpointUrl=Se("hts/frbslgigp.ogepscmv/ieo/eaylg","tp:/ieaeogn-agolai.o/1frlglgc/o"),this.transportKey=Se("AzSC8r6ReiGqFMyfvgow","Iayx0u-XT3vksVM-pIV"),this.logSource=462,this.logTraceAfterSampling=!1,this.logNetworkAfterSampling=!1,this.configTimeToLive=12,this.logMaxFlushSize=40}getFlTransportFullUrl(){return this.flTransportEndpointUrl.concat("?key=",this.transportKey)}static getInstance(){return G===void 0&&(G=new m),G}}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */var L;(function(t){t[t.UNKNOWN=0]="UNKNOWN",t[t.VISIBLE=1]="VISIBLE",t[t.HIDDEN=2]="HIDDEN"})(L||(L={}));const $t=["firebase_","google_","ga_"],jt=new RegExp("^[a-zA-Z]\\w*$"),Gt=40,ee=100;function Kt(){const t=d.getInstance().navigator;return t!=null&&t.serviceWorker?t.serviceWorker.controller?2:3:1}function Xt(){switch(d.getInstance().document.visibilityState){case"visible":return L.VISIBLE;case"hidden":return L.HIDDEN;default:return L.UNKNOWN}}function Wt(){const e=d.getInstance().navigator.connection;switch(e&&e.effectiveType){case"slow-2g":return 1;case"2g":return 2;case"3g":return 3;case"4g":return 4;default:return 0}}function Ht(t){return t.length===0||t.length>Gt?!1:!$t.some(n=>t.startsWith(n))&&!!t.match(jt)}function Yt(t){return t.length!==0&&t.length<=ee}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function et(t){var n;const e=(n=t.options)==null?void 0:n.appId;if(!e)throw p.create("no app id");return e}function Jt(t){var n;const e=(n=t.options)==null?void 0:n.projectId;if(!e)throw p.create("no project id");return e}function Qt(t){var n;const e=(n=t.options)==null?void 0:n.apiKey;if(!e)throw p.create("no api key");return e}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Zt="0.0.1",g={loggingEnabled:!0},en="FIREBASE_INSTALLATIONS_AUTH";function tn(t,e){const n=nn();return n?(be(n),Promise.resolve()):on(t,e).then(be).then(r=>rn(r),()=>{})}function nn(){const t=d.getInstance().localStorage;if(!t)return;const e=t.getItem(Ye);if(!e||!sn(e))return;const n=t.getItem(He);if(n)try{return JSON.parse(n)}catch(r){return}}function rn(t){const e=d.getInstance().localStorage;!t||!e||(e.setItem(He,JSON.stringify(t)),e.setItem(Ye,String(Date.now()+m.getInstance().configTimeToLive*60*60*1e3)))}const an="Could not fetch config, will use default configs";function on(t,e){return qt(t.installations).then(n=>{const r=Jt(t.app),i=Qt(t.app),s=`https://firebaseremoteconfig.googleapis.com/v1/projects/${r}/namespaces/fireperf:fetch?key=${i}`,o=new Request(s,{method:"POST",headers:{Authorization:`${en} ${n}`},body:JSON.stringify({app_instance_id:e,app_instance_id_token:n,app_id:et(t.app),app_version:Ve,sdk_version:Zt})});return fetch(o).then(a=>{if(a.ok)return a.json();throw p.create("RC response not ok")})}).catch(()=>{_.info(an)})}function be(t){if(!t)return t;const e=m.getInstance(),n=t.entries||{};return n.fpr_enabled!==void 0?e.loggingEnabled=String(n.fpr_enabled)==="true":e.loggingEnabled=g.loggingEnabled,n.fpr_log_source?e.logSource=Number(n.fpr_log_source):g.logSource&&(e.logSource=g.logSource),n.fpr_log_endpoint_url?e.logEndPointUrl=n.fpr_log_endpoint_url:g.logEndPointUrl&&(e.logEndPointUrl=g.logEndPointUrl),n.fpr_log_transport_key?e.transportKey=n.fpr_log_transport_key:g.transportKey&&(e.transportKey=g.transportKey),n.fpr_vc_network_request_sampling_rate!==void 0?e.networkRequestsSamplingRate=Number(n.fpr_vc_network_request_sampling_rate):g.networkRequestsSamplingRate!==void 0&&(e.networkRequestsSamplingRate=g.networkRequestsSamplingRate),n.fpr_vc_trace_sampling_rate!==void 0?e.tracesSamplingRate=Number(n.fpr_vc_trace_sampling_rate):g.tracesSamplingRate!==void 0&&(e.tracesSamplingRate=g.tracesSamplingRate),n.fpr_log_max_flush_size?e.logMaxFlushSize=Number(n.fpr_log_max_flush_size):g.logMaxFlushSize&&(e.logMaxFlushSize=g.logMaxFlushSize),e.logTraceAfterSampling=ye(e.tracesSamplingRate),e.logNetworkAfterSampling=ye(e.networkRequestsSamplingRate),t}function sn(t){return Number(t)>Date.now()}function ye(t){return Math.random()<=t}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */let fe=1,K;function tt(t){return fe=2,K=K||un(t),K}function cn(){return fe===3}function un(t){return ln().then(()=>Vt(t.installations)).then(e=>tn(t,e)).then(()=>Ae(),()=>Ae())}function ln(){const t=d.getInstance().document;return new Promise(e=>{if(t&&t.readyState!=="complete"){const n=()=>{t.readyState==="complete"&&(t.removeEventListener("readystatechange",n),e())};t.addEventListener("readystatechange",n)}else e()})}function Ae(){fe=3}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const nt=10*1e3,fn=5.5*1e3,dn=1e3,rt=3,pn=65536,mn=new TextEncoder;let D=rt,T=[],Me=!1;function gn(){Me||(de(fn),Me=!0)}function de(t){setTimeout(()=>{D<=0||(T.length>0&&hn(),de(nt))},t)}function hn(){const t=T.splice(0,dn),e=te(t);Tn(e).then(()=>{D=rt}).catch(()=>{T=[...t,...T],D--,_.info(`Tries left: ${D}.`),de(nt)})}function te(t){const e=t.map(r=>({source_extension_json_proto3:r.message,event_time_ms:String(r.eventTime)})),n={request_time_ms:String(Date.now()),client_info:{client_type:1,js_client_info:{}},log_source:m.getInstance().logSource,log_event:e};return JSON.stringify(n)}function Tn(t){const e=m.getInstance().getFlTransportFullUrl();return mn.encode(t).length<=pn&&navigator.sendBeacon&&navigator.sendBeacon(e,t)?Promise.resolve():fetch(e,{method:"POST",body:t})}function En(t){if(!t.eventTime||!t.message)throw p.create("invalid cc log");T=[...T,t]}function vn(t){return(...e)=>{const n=t(...e);En({message:n,eventTime:Date.now()})}}function _n(){const t=m.getInstance().getFlTransportFullUrl();for(;T.length>0;){const e=T.splice(-m.getInstance().logMaxFlushSize),n=te(e);if(!(navigator.sendBeacon&&navigator.sendBeacon(t,n))){T=[...T,...e];break}}if(T.length>0){const e=te(T);fetch(t,{method:"POST",body:e}).catch(()=>{_.info("Failed flushing queued events.")})}}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */let O;function it(t,e){O||(O={send:vn(bn),flush:_n}),O.send(t,e)}function k(t){const e=m.getInstance();!e.instrumentationEnabled&&t.isAuto||!e.dataCollectionEnabled&&!t.isAuto||d.getInstance().requiredApisAvailable()&&(cn()?X(t):tt(t.performanceController).then(()=>X(t),()=>X(t)))}function In(){O&&O.flush()}function X(t){if(!le())return;const e=m.getInstance();!e.loggingEnabled||!e.logTraceAfterSampling||it(t,1)}function Sn(t){const e=m.getInstance();if(!e.instrumentationEnabled)return;const n=t.url,r=e.logEndPointUrl.split("?")[0],i=e.flTransportEndpointUrl.split("?")[0];n===r||n===i||!e.loggingEnabled||!e.logNetworkAfterSampling||it(t,0)}function bn(t,e){return e===0?yn(t):An(t)}function yn(t){const e={url:t.url,http_method:t.httpMethod||0,http_response_code:200,response_payload_bytes:t.responsePayloadBytes,client_start_time_us:t.startTimeUs,time_to_response_initiated_us:t.timeToResponseInitiatedUs,time_to_response_completed_us:t.timeToResponseCompletedUs},n={application_info:at(t.performanceController.app),network_request_metric:e};return JSON.stringify(n)}function An(t){const e={name:t.name,is_auto:t.isAuto,client_start_time_us:t.startTimeUs,duration_us:t.durationUs};Object.keys(t.counters).length!==0&&(e.counters=t.counters);const n=t.getAttributes();Object.keys(n).length!==0&&(e.custom_attributes=n);const r={application_info:at(t.performanceController.app),trace_metric:e};return JSON.stringify(r)}function at(t){return{google_app_id:et(t),app_instance_id:le(),web_app_info:{sdk_version:Ve,page_url:d.getInstance().getUrl(),service_worker_status:Kt(),visibility_state:Xt(),effective_connection_type:Wt()},application_process_state:0}}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function Ne(t,e){const n=e;if(!n||n.responseStart===void 0)return;const r=d.getInstance().getTimeOrigin(),i=Math.floor((n.startTime+r)*1e3),s=n.responseStart?Math.floor((n.responseStart-n.startTime)*1e3):void 0,o=Math.floor((n.responseEnd-n.startTime)*1e3),a=n.name&&n.name.split("?")[0],c={performanceController:t,url:a,responsePayloadBytes:n.transferSize,startTimeUs:i,timeToResponseInitiatedUs:s,timeToResponseCompletedUs:o};Sn(c)}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Mn=100,Nn="_",Rn=[$e,je,Ge,Ke,We,Xe];function Pn(t,e){return t.length===0||t.length>Mn?!1:e&&e.startsWith(qe)&&Rn.indexOf(t)>-1||!t.startsWith(Nn)}function Cn(t){const e=Math.floor(t);return e<t&&_.info(`Metric value should be an Integer, setting the value as : ${e}.`),e}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class R{constructor(e,n,r=!1,i){this.performanceController=e,this.name=n,this.isAuto=r,this.state=1,this.customAttributes={},this.counters={},this.api=d.getInstance(),this.randomId=Math.floor(Math.random()*1e6),this.isAuto||(this.traceStartMark=`${wt}-${this.randomId}-${this.name}`,this.traceStopMark=`${Ut}-${this.randomId}-${this.name}`,this.traceMeasure=i||`${Z}-${this.randomId}-${this.name}`,i&&this.calculateTraceMetrics())}start(){if(this.state!==1)throw p.create("trace started",{traceName:this.name});this.api.mark(this.traceStartMark),this.state=2}stop(){if(this.state!==2)throw p.create("trace stopped",{traceName:this.name});this.state=3,this.api.mark(this.traceStopMark),this.api.measure(this.traceMeasure,this.traceStartMark,this.traceStopMark),this.calculateTraceMetrics(),k(this)}record(e,n,r){if(e<=0)throw p.create("nonpositive trace startTime",{traceName:this.name});if(n<=0)throw p.create("nonpositive trace duration",{traceName:this.name});if(this.durationUs=Math.floor(n*1e3),this.startTimeUs=Math.floor(e*1e3),r&&r.attributes&&(this.customAttributes={...r.attributes}),r&&r.metrics)for(const i of Object.keys(r.metrics))isNaN(Number(r.metrics[i]))||(this.counters[i]=Math.floor(Number(r.metrics[i])));k(this)}incrementMetric(e,n=1){this.counters[e]===void 0?this.putMetric(e,n):this.putMetric(e,this.counters[e]+n)}putMetric(e,n){if(Pn(e,this.name))this.counters[e]=Cn(n!=null?n:0);else throw p.create("invalid custom metric name",{customMetricName:e})}getMetric(e){return this.counters[e]||0}putAttribute(e,n){const r=Ht(e),i=Yt(n);if(r&&i){this.customAttributes[e]=n;return}if(!r)throw p.create("invalid attribute name",{attributeName:e});if(!i)throw p.create("invalid attribute value",{attributeValue:n})}getAttribute(e){return this.customAttributes[e]}removeAttribute(e){this.customAttributes[e]!==void 0&&delete this.customAttributes[e]}getAttributes(){return{...this.customAttributes}}setStartTime(e){this.startTimeUs=e}setDuration(e){this.durationUs=e}calculateTraceMetrics(){const e=this.api.getEntriesByName(this.traceMeasure),n=e&&e[0];n&&(this.durationUs=Math.floor(n.duration*1e3),this.startTimeUs=Math.floor((n.startTime+this.api.getTimeOrigin())*1e3))}static createOobTrace(e,n,r,i,s){const o=d.getInstance().getUrl();if(!o)return;const a=new R(e,qe+o,!0),c=Math.floor(d.getInstance().getTimeOrigin()*1e3);a.setStartTime(c),n&&n[0]&&(a.setDuration(Math.floor(n[0].duration*1e3)),a.putMetric("domInteractive",Math.floor(n[0].domInteractive*1e3)),a.putMetric("domContentLoadedEventEnd",Math.floor(n[0].domContentLoadedEventEnd*1e3)),a.putMetric("loadEventEnd",Math.floor(n[0].loadEventEnd*1e3)));const u="first-paint",f="first-contentful-paint";if(r){const l=r.find(v=>v.name===u);l&&l.startTime&&a.putMetric($e,Math.floor(l.startTime*1e3));const h=r.find(v=>v.name===f);h&&h.startTime&&a.putMetric(je,Math.floor(h.startTime*1e3)),s&&a.putMetric(Ge,Math.floor(s*1e3))}this.addWebVitalMetric(a,Ke,Ft,i.lcp),this.addWebVitalMetric(a,We,Dt,i.cls),this.addWebVitalMetric(a,Xe,kt,i.inp),k(a),In()}static addWebVitalMetric(e,n,r,i){i&&(e.putMetric(n,Math.floor(i.value*1e3)),i.elementAttribution&&(i.elementAttribution.length>ee?e.putAttribute(r,i.elementAttribution.substring(0,ee)):e.putAttribute(r,i.elementAttribution)))}static createUserTimingTrace(e,n){const r=new R(e,n,!1,n);k(r)}}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */let B={},Re=!1,ot;function Pe(t){le()&&(setTimeout(()=>On(t),0),setTimeout(()=>Ln(t),0),setTimeout(()=>wn(t),0))}function Ln(t){const e=d.getInstance(),n=e.getEntriesByType("resource");for(const r of n)Ne(t,r);e.setupObserver("resource",r=>Ne(t,r))}function On(t){const e=d.getInstance();"onpagehide"in window?e.document.addEventListener("pagehide",()=>W(t)):e.document.addEventListener("unload",()=>W(t)),e.document.addEventListener("visibilitychange",()=>{e.document.visibilityState==="hidden"&&W(t)}),e.onFirstInputDelay&&e.onFirstInputDelay(n=>{ot=n}),e.onLCP(n=>{var r;B.lcp={value:n.value,elementAttribution:(r=n.attribution)==null?void 0:r.element}}),e.onCLS(n=>{var r;B.cls={value:n.value,elementAttribution:(r=n.attribution)==null?void 0:r.largestShiftTarget}}),e.onINP(n=>{var r;B.inp={value:n.value,elementAttribution:(r=n.attribution)==null?void 0:r.interactionTarget}})}function wn(t){const e=d.getInstance(),n=e.getEntriesByType("measure");for(const r of n)Ce(t,r);e.setupObserver("measure",r=>Ce(t,r))}function Ce(t,e){const n=e.name;n.substring(0,Z.length)!==Z&&R.createUserTimingTrace(t,n)}function W(t){if(!Re){Re=!0;const e=d.getInstance(),n=e.getEntriesByType("navigation"),r=e.getEntriesByType("paint");setTimeout(()=>{R.createOobTrace(t,n,r,B,ot)},0)}}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Un{constructor(e,n){this.app=e,this.installations=n,this.initialized=!1}_init(e){this.initialized||((e==null?void 0:e.dataCollectionEnabled)!==void 0&&(this.dataCollectionEnabled=e.dataCollectionEnabled),(e==null?void 0:e.instrumentationEnabled)!==void 0&&(this.instrumentationEnabled=e.instrumentationEnabled),d.getInstance().requiredApisAvailable()?Et().then(n=>{n&&(gn(),tt(this).then(()=>Pe(this),()=>Pe(this)),this.initialized=!0)}).catch(n=>{_.info(`Environment doesn't support IndexedDB: ${n}`)}):_.info('Firebase Performance cannot start if the browser does not support "Fetch" and "Promise", or cookies are disabled.'))}set instrumentationEnabled(e){m.getInstance().instrumentationEnabled=e}get instrumentationEnabled(){return m.getInstance().instrumentationEnabled}set dataCollectionEnabled(e){m.getInstance().dataCollectionEnabled=e}get dataCollectionEnabled(){return m.getInstance().dataCollectionEnabled}}const Fn="[DEFAULT]";function xn(t=ut()){return t=ne(t),Le(t,"performance").getImmediate()}function Vn(t,e){t=ne(t);const n=Le(t,"performance");if(n.isInitialized()){const i=n.getImmediate(),s=n.getOptions();if(lt(s,e!=null?e:{}))return i;throw p.create("already initialized")}return n.initialize({options:e})}function qn(t,e){return t=ne(t),new R(t,e)}const kn=(t,{options:e})=>{const n=t.getProvider("app").getImmediate(),r=t.getProvider("installations-internal").getImmediate();if(n.name!==Fn)throw p.create("FB not default");if(typeof window=="undefined")throw p.create("no window");xt(window);const i=new Un(n,r);return i._init(e),i};function Dn(){ht(new Tt("performance",kn,"PUBLIC")),pe(Ie,Q),pe(Ie,Q,"esm2020")}Dn();export{xn as getPerformance,Vn as initializePerformance,qn as trace};
