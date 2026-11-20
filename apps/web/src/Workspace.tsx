import { useCallback, useEffect, useState } from "react";
import { getSupabase } from "@barkoul/data";
import type { Cargo, ProfileRole } from "@barkoul/domain";

type Row = Record<string, any>;
interface WorkspaceProps { userId: string; role: ProfileRole; openCargos: Cargo[]; }

const tripLabels: Record<string,string> = {
  agreed:"تم الاتفاق", loading:"جاري التحميل", in_transit:"في الطريق",
  delivered:"تم التسليم", cancelled:"ملغاة"
};

function OfferCard({cargo,userId,onSent}:{cargo:Cargo;userId:string;onSent:()=>void}) {
  const [price,setPrice]=useState(""); const [note,setNote]=useState("");
  const [busy,setBusy]=useState(false); const [message,setMessage]=useState("");
  async function submit(e:React.FormEvent){
    e.preventDefault(); const db=getSupabase(); const amount=Number(price);
    if(!db||!Number.isFinite(amount)||amount<=0){setMessage("أدخل عرضاً مالياً صحيحاً.");return;}
    setBusy(true);setMessage("");
    try { const {error}=await db.from("negotiations").insert({cargo_id:cargo.id,proposer_id:userId,proposed_price_mad:amount,message:note.trim()||null,status:"pending"});
      if(error)throw error;setMessage("تم إرسال عرضك لصاحب الشحنة.");setPrice("");setNote("");onSent();
    } catch { setMessage("تعذر إرسال العرض. تحقق من حالة الشحنة أو وجود عرض سابق."); } finally { setBusy(false); }
  }
  if(cargo.owner_id===userId)return null;
  return <form className="form-card" onSubmit={submit}><h3>{cargo.title}</h3>
    <p>{cargo.origin_city} ← {cargo.destination_city}</p>
    <label>عرضك بالدرهم<input type="number" min="0.01" step="0.01" required value={price} onChange={e=>setPrice(e.target.value)}/></label>
    <label>رسالة لصاحب الشحنة<textarea maxLength={500} value={note} onChange={e=>setNote(e.target.value)}/></label>
    <button className="button button-primary" disabled={busy}>{busy?"جارٍ الإرسال…":"إرسال عرض"}</button>
    {message&&<p className="form-message" role="status">{message}</p>}</form>;
}

export default function Workspace({userId,role,openCargos}:WorkspaceProps) {
  const [cargos,setCargos]=useState<Row[]>([]);
  const [offers,setOffers]=useState<Row[]>([]);
  const [incoming,setIncoming]=useState<Row[]>([]);
  const [trips,setTrips]=useState<Row[]>([]);
  const [documents,setDocuments]=useState<Row[]>([]);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [docType,setDocType]=useState("رخصة السياقة");
  const [file,setFile]=useState<File|null>(null);
  const db=getSupabase();

  const load=useCallback(async()=>{
    if(!db)return;
    const [cargoRes,offerRes,tripRes,docRes]=await Promise.all([
      role==="owner"||role==="admin" ? db.from("cargos").select("id,title,origin_city,destination_city,status,loading_date,offered_price_mad").eq("owner_id",userId).order("created_at",{ascending:false}) : Promise.resolve({data:[],error:null}),
      role==="driver"||role==="admin" ? db.from("negotiations").select("id,cargo_id,proposed_price_mad,message,status,created_at").eq("proposer_id",userId).order("created_at",{ascending:false}) : Promise.resolve({data:[],error:null}),
      db.from("trips").select("id,cargo_id,owner_id,driver_id,agreed_price_mad,status,last_latitude,last_longitude,location_updated_at,created_at").or(`owner_id.eq.${userId},driver_id.eq.${userId}`).order("created_at",{ascending:false}),
      role==="driver"||role==="admin" ? db.from("driver_documents").select("id,document_type,storage_path,review_status,uploaded_at").eq("driver_id",userId).order("uploaded_at",{ascending:false}) : Promise.resolve({data:[],error:null})
    ]);
    if(cargoRes.error||offerRes.error||tripRes.error||docRes.error) throw new Error("تعذر تحميل بعض بيانات الحساب.");
    const mine=cargoRes.data??[];
    setCargos(mine); setOffers(offerRes.data??[]); setTrips(tripRes.data??[]); setDocuments(docRes.data??[]);
    if(mine.length){
      const inc=await db.from("negotiations").select("id,cargo_id,proposer_id,proposed_price_mad,message,status,created_at")
        .in("cargo_id",mine.map((x:any)=>x.id)).order("created_at",{ascending:false});
      if(inc.error) throw inc.error;
      setIncoming(inc.data??[]);
    } else setIncoming([]);
  },[db,userId,role]);

  useEffect(()=>{void load().catch(()=>setMessage("تعذر تحميل مساحة حسابك. حاول تحديث الصفحة."));},[load]);

  async function decideOffer(id:number,accept:boolean){
    if(!db)return;setBusy(true);setMessage("");
    try{const {data,error}=await db.rpc("respond_to_negotiation",{p_negotiation_id:id,p_accept:accept});if(error)throw error;
      setMessage(accept?`تم قبول العرض وإنشاء الرحلة رقم ${data}.`:"تم رفض العرض.");await load();
    }catch{setMessage("تعذر معالجة العرض؛ ربما انتهت صلاحيته أو لا تملك صلاحية اتخاذ القرار.");}
    finally{setBusy(false);}
  }

  async function sendDocument(){
    if(!db||!file)return;setBusy(true);setMessage("");
    const safeName=file.name.replace(/[^a-zA-Z0-9._-]/g,"_").slice(-100);
    const path=`${userId}/${crypto.randomUUID()}-${safeName}`;
    try{
      const {error:uploadError}=await db.storage.from("driver-documents").upload(path,file,{contentType:file.type,upsert:false});
      if(uploadError)throw uploadError;
      const {error:rowError}=await db.from("driver_documents").insert({driver_id:userId,document_type:docType,storage_path:path,review_status:"pending"});
      if(rowError){await db.storage.from("driver-documents").remove([path]);throw rowError;}
      setFile(null);setMessage("تم رفع الوثيقة بأمان وإرسالها للمراجعة.");await load();
    }catch{setMessage("تعذر رفع الوثيقة. تأكد من نوع الملف وحجمه (10 ميغابايت كحد أقصى).");}
    finally{setBusy(false);}
  }

  async function progress(trip:Row,status:string,withGps=false){
    if(!db)return;setBusy(true);setMessage("");
    try{
      let latitude:number|null=null,longitude:number|null=null;
      if(withGps){
        const position=await new Promise<GeolocationPosition>((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:true,timeout:12000}));
        latitude=position.coords.latitude;longitude=position.coords.longitude;
      }
      const {error}=await db.rpc("update_trip_progress",{p_trip_id:trip.id,p_status:status,p_latitude:latitude,p_longitude:longitude});
      if(error)throw error;setMessage("تم تحديث حالة الرحلة.");await load();
    }catch{setMessage(withGps?"تعذر تحديث الموقع. تحقق من إذن الموقع والاتصال.":"تعذر تحديث الرحلة؛ تحقق من الحالة الحالية وصلاحياتك.");}
    finally{setBusy(false);}
  }

  return <section className="section" id="workspace">
    <div className="section-heading"><div><p className="eyebrow">حسابك</p><h2>مساحة العمل</h2></div>
      <button className="button button-outline" onClick={()=>void load()} disabled={busy}>تحديث البيانات</button></div>
    {(role==="owner"||role==="admin")&&<div className="workspace-block">
      <h3>شحناتي وعروض السائقين</h3>
      {cargos.length===0?<p className="empty">لم تنشر شحنات بعد.</p>:cargos.map(c=><article className="cargo-card" key={c.id}>
        <h3>{c.title}</h3><p>{c.origin_city} ← {c.destination_city} · الحالة: {c.status}</p>
        {incoming.filter(o=>o.cargo_id===c.id).map(o=><div className="offer-row" key={o.id}>
          <span>عرض السائق: {Number(o.proposed_price_mad).toLocaleString("ar-MA")} درهم</span>
          <span>{o.message||"دون رسالة"} · {o.status}</span>
          {o.status==="pending"&&c.status==="open"&&<div className="hero-actions">
            <button className="button button-primary" disabled={busy} onClick={()=>void decideOffer(o.id,true)}>قبول العرض</button>
            <button className="button button-outline" disabled={busy} onClick={()=>void decideOffer(o.id,false)}>رفض</button>
          </div>}
        </div>)}
      </article>)}
    </div>}
    {(role==="driver"||role==="admin")&&<div className="workspace-block">
      <h3>الشحنات المتاحة لتقديم العروض</h3>
      {openCargos.length===0?<p className="empty">لا توجد شحنات مفتوحة حالياً.</p>:openCargos.map(c=><OfferCard key={c.id} cargo={c} userId={userId} onSent={()=>void load()}/>)}
      <h3>عروضي</h3>
      {offers.length===0?<p className="empty">لم ترسل عروضاً بعد.</p>:offers.map(o=><article className="cargo-card" key={o.id}>
        <strong>{Number(o.proposed_price_mad).toLocaleString("ar-MA")} درهم</strong>
        <p>الشحنة #{o.cargo_id} · {o.status}</p><p className="muted">{o.message}</p>
      </article>)}
      <h3>وثائق التحقق</h3>
      <form className="form-card" onSubmit={e=>{e.preventDefault();void sendDocument();}}>
        <label>نوع الوثيقة<select value={docType} onChange={e=>setDocType(e.target.value)}>
          <option>رخصة السياقة</option><option>البطاقة الوطنية</option><option>وثيقة المركبة</option><option>وثيقة أخرى</option>
        </select></label>
        <label>اختر PDF أو صورة<input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={e=>setFile(e.target.files?.[0]??null)}/></label>
        <button className="button button-primary" disabled={busy||!file}>رفع الوثيقة الخاصة</button>
      </form>
      {documents.map(d=><p className="form-message" key={d.id}>{d.document_type} — {d.review_status==="pending"?"قيد المراجعة":d.review_status==="verified"?"تم التحقق":"مرفوضة"}</p>)}
    </div>}
    <div className="workspace-block"><h3>رحلاتي</h3>
      {trips.length===0?<p className="empty">لا توجد رحلات مرتبطة بحسابك حالياً.</p>:trips.map(t=><article className="cargo-card" key={t.id}>
        <h3>الرحلة #{t.id}</h3><p>{tripLabels[t.status]??t.status} · {Number(t.agreed_price_mad).toLocaleString("ar-MA")} درهم</p>
        {t.last_latitude!=null&&<p className="muted">آخر موقع: {t.last_latitude.toFixed(5)}, {t.last_longitude.toFixed(5)}</p>}
        <div className="hero-actions">
          {t.status==="agreed"&&<button className="button button-primary" disabled={busy} onClick={()=>void progress(t,"loading")}>بدء التحميل</button>}
          {t.status==="loading"&&t.driver_id===userId&&<button className="button button-primary" disabled={busy} onClick={()=>void progress(t,"in_transit",true)}>بدء الرحلة وإرسال موقعي</button>}
          {t.status==="in_transit"&&t.driver_id===userId&&<button className="button button-primary" disabled={busy} onClick={()=>void progress(t,"delivered",true)}>تأكيد التسليم</button>}
          {(t.status==="agreed"||t.status==="loading")&&<button className="button button-outline" disabled={busy} onClick={()=>void progress(t,"cancelled")}>إلغاء الرحلة</button>}
        </div>
      </article>)}
    </div>}
    {message&&<p className="form-message" role="status">{message}</p>}
  </section>;
}
