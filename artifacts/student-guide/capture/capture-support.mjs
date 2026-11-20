import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const root=path.resolve('D:/Ahliyaa students');
process.chdir(path.join(root,'client'));
const requireClient=createRequire(path.join(root,'client/package.json'));
const {createServer}=await import(pathToFileURL(requireClient.resolve('vite')).href);
const {chromium}=await import('../tools/node_modules/playwright/index.mjs');
const out=path.join(root,'artifacts/student-guide/capture');
await fs.mkdir(out,{recursive:true});
const server=await createServer({root:path.join(root,'client'),configFile:path.join(root,'client/vite.config.js'),define:{'import.meta.env.VITE_API_URL':JSON.stringify('/demo-api')},server:{host:'127.0.0.1',port:5177,strictPort:true}});
await server.listen();
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--no-first-run']});
const context=await browser.newContext({viewport:{width:430,height:700},deviceScaleFactor:2,locale:'ar-JO',colorScheme:'light',isMobile:true,hasTouch:true});
await context.addInitScript(()=>{localStorage.setItem('lms_lang','ar');localStorage.setItem('lms_theme','light');});
const page=await context.newPage();
page.setDefaultTimeout(6000);
let signed=false,first=true;
const user=()=>({id:'demo-student',_id:'demo-student',name:'سارة أحمد',username:'student.demo',email:'student@example.com',role:'student',emailVerified:!first,mustChangePassword:first,tourCompletedAt:'2026-11-01T10:00:00Z'});
const course={_id:'demo-course',title:'أساسيات تحليل البيانات',description:'تعلّم قراءة البيانات وتحليلها خطوة بخطوة مع أمثلة وتطبيقات عملية.',category:'مهارات أكاديمية',difficulty:'beginner',teacher:{name:'د. ليلى منصور'},lessonCount:4,quizCount:1,durationMinutes:90,freeLessonCount:1};
const quiz={_id:'demo-quiz',title:'اختبار المفاهيم الأساسية',timeLimitMinutes:15,passingScore:60,maxAttempts:2,myAttempts:[],isPublished:true,isLocked:false,antiCheat:{enabled:false}};
const assignment={_id:'demo-assignment',title:'تطبيق: قراءة جدول بيانات',instructions:'اكتب ملخصاً قصيراً يوضح ما تعلمته من المثال، وأرفق ملفك عند الحاجة.',maxPoints:10,dueAt:'2026-11-24T18:00:00Z'};
const lessons=[{_id:'lesson-video',title:'ابدأ هنا: قراءة البيانات',type:'video',durationMinutes:20,video:{_id:'demo-video',status:'ready'},progress:{completed:false,positionSeconds:0}},{_id:'lesson-text',title:'ملخص الدرس ونقاط المراجعة',type:'text',content:'بيانات توضيحية للتدريب\n\n١. حدّد السؤال الذي تريد الإجابة عنه.\n٢. اقرأ العناوين والوحدات قبل مقارنة الأرقام.\n٣. لخّص النتيجة بلغة واضحة.',durationMinutes:10},{_id:'lesson-quiz',title:'اختبر فهمك',type:'quiz',quiz},{_id:'lesson-assignment',title:'الواجب التطبيقي',type:'assignment',assignment}];
const enrollment={_id:'demo-enrollment',course,status:'active',progressPercent:25,isFavorite:true};
const attempt={_id:'demo-result',quiz,course,attemptNumber:1,percent:90,passed:true,status:'graded',submittedAt:'2026-11-16T10:30:00Z',score:9,maxScore:10};
const meta={page:1,limit:20,total:1,pages:1,totalPages:1};
const practice=[{_id:'practice-1',text:'أي خطوة تساعدك أولاً على فهم جدول البيانات؟',type:'multiple_choice',multipleCorrect:false,options:[{id:'o1',text:'قراءة العناوين والوحدات'},{id:'o2',text:'اختيار أكبر رقم مباشرة'},{id:'o3',text:'تجاهل مصدر البيانات'}]}];
const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.log('PAGE ERROR',e.message)});
const captureMetadata={viewport:{width:430,height:700},deviceScaleFactor:2,screens:{}};
await context.route('**/*',async route=>{const u=new URL(route.request().url());
 if(!['127.0.0.1','localhost'].includes(u.hostname)){console.log('BLOCKED EXTERNAL',u.hostname);return route.abort();}
 if(!u.pathname.startsWith('/demo-api'))return route.continue();
 const p=u.pathname.slice(9),method=route.request().method();let data={};let status=200;
 if(p==='/auth/refresh'){if(signed)data={user:user(),accessToken:'fictional-demo-token'};else{status=401;data={message:'Demo signed out'};}}
 else if(p==='/auth/login'){signed=true;data={user:user(),accessToken:'fictional-demo-token'};}
 else if(p==='/auth/me')data=user();
 else if(p==='/auth/set-password'){first=false;data={ok:true};}
 else if(p==='/analytics/student')data={stats:{enrolledCourses:1,completedCourses:0,avgScore:90},enrollments:[enrollment],recentAttempts:[attempt],continueLearning:{course,lesson:lessons[0]}};
 else if(p==='/courses/catalog')data={items:[course,{...course,_id:'demo-course-two',title:'مهارات الدراسة الجامعية',category:'مهارات الدراسة',freeLessonCount:2,lessonCount:6,quizCount:2}],meta:{...meta,total:2}};
 else if(p==='/enrollments/mine')data=[enrollment];
 else if(p==='/courses/demo-course')data={course,curriculum:[{_id:'section-1',title:'الوحدة الأولى: المفاهيم والتطبيق',lessons}],enrollment};
 else if(p.startsWith('/courses/demo-course/lessons/'))data=lessons.find(l=>l._id===p.split('/').at(-1))||lessons[0];
 else if(p==='/quizzes/courses/demo-course')data=[quiz];
 else if(p==='/assignments/courses/demo-course')data=[assignment];
 else if(p==='/announcements/courses/demo-course')data={items:[{_id:'demo-ann',title:'مرحباً بكم في الدورة',body:'تابع الدروس بالترتيب، وراجع المواعيد قبل بدء الاختبارات.',createdAt:'2026-11-16T12:00:00Z'}]};
 else if(p==='/qa/courses/demo-course')data={items:[]};
 else if(p==='/qa/blocked-users')data=[];
 else if(p==='/videos/demo-video/token')data={token:'fictional-demo-media',viewLimit:4,viewsRemaining:4};
 else if(p==='/videos/watermark/me')data={enabled:true,lines:['عرض توضيحي','student.demo']};
 else if(p==='/videos/demo-video/stream')return route.fulfill({status:200,contentType:'video/mp4',body:await fs.readFile(path.join(out,'demo-lesson.mp4'))});
 else if(p==='/quizzes/attempts/mine')data={items:[attempt],meta};
 else if(p==='/quizzes/courses/demo-course/demo-quiz/start')data={attemptId:'demo-attempt',attemptNumber:1,quiz,questions:[{questionId:'q1',text:'ما الخطوة الأولى عند قراءة جدول بيانات؟',type:'multiple_choice',points:1,options:[{id:'a',text:'قراءة عناوين الأعمدة والوحدات'},{id:'b',text:'تجاهل الوحدات'},{id:'c',text:'جمع الأرقام دون قراءة'}]},{questionId:'q2',text:'ما فائدة تلخيص النتيجة؟',type:'short_answer',points:1}],deadlineAt:new Date(Date.now()+15*60000).toISOString(),answers:[]};
 else if(p==='/past-papers')data={items:[{_id:'demo-paper',title:'أسئلة مراجعة: تحليل البيانات',subject:'تحليل البيانات',sizeBytes:450560,practiceCount:1,practicePublished:true},{_id:'demo-paper-2',title:'أسئلة مراجعة: مهارات الدراسة',subject:'مهارات الدراسة',sizeBytes:300000,practiceCount:0}]};
 else if(p==='/past-papers/demo-paper/practice')data={items:practice};
 else if(p.endsWith('/check'))data={correct:true,explanation:'ابدأ بقراءة العناوين والوحدات حتى تكون المقارنة صحيحة.'};
 else if(p==='/notifications/unread-count')data={count:0};
 else if(p==='/notifications')data={items:[],meta};
 else if(method==='GET')data={items:[],meta};
 return route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
});
async function shot(name){await page.waitForTimeout(700);await page.locator('.fixed.bottom-4.end-4 button').evaluateAll(els=>els.forEach(e=>e.click()));await page.screenshot({path:path.join(out,name+'.png')});captureMetadata.screens[name]=await page.locator('input,textarea,button,[role="radiogroup"],video').evaluateAll(els=>els.map(e=>{const b=e.getBoundingClientRect();return {tag:e.tagName,type:e.type,text:e.getAttribute('aria-label')||e.getAttribute('placeholder')||e.innerText||e.closest('label')?.innerText||'',box:{x:b.x,y:b.y,width:b.width,height:b.height}}}).filter(e=>e.box.width&&e.box.height&&e.box.y<700&&e.box.y+e.box.height>0));console.log('CAPTURED',name);}
async function go(url){await page.goto('http://127.0.0.1:5177'+url,{waitUntil:'domcontentloaded',timeout:45000});await page.waitForTimeout(1200);await page.evaluate(()=>document.fonts.ready);}
signed=true;first=false;
try{await go('/support#arabic');await page.locator('#arabic summary').first().click();await page.locator('#arabic').scrollIntoViewIfNeeded();await shot('20-support');}catch(e){console.error(e);process.exitCode=1;}
const existing=JSON.parse(await fs.readFile(path.join(out,'capture-metadata.json'),'utf8'));Object.assign(existing.screens,captureMetadata.screens);await fs.writeFile(path.join(out,'capture-metadata.json'),JSON.stringify(existing,null,2));
await fs.copyFile(path.join(out,'20-support.png'),path.join(out,'support.png'));
await browser.close();await server.close();