import { sql } from "../db";

// No elevation lookup or Hazard Urgency columns since manuscript revision
// Phase 1, step 7b, matching ReportsService.submit (step 7a).

const lat=15.0733, lng=120.5406;
const exif={GPSLatitude:lat,GPSLongitude:lng,DateTimeOriginal:new Date().toISOString(),Make:"Porac SDSS",Model:"Mock Citizen Camera"};
async function main(){
 const [citizen]=await sql<{id:number}[]>`SELECT id FROM citizens WHERE email='citizen@porac.ph'`;
 if(!citizen) throw new Error('Run seed:users first');
 const [barangay]=await sql<{id:number;name:string}[]>`SELECT id,name FROM barangays WHERE ST_Contains(geom,ST_SetSRID(ST_MakePoint(${lng},${lat}),4326))`;
 if(!barangay) throw new Error('Mock point is outside Porac barangays');
 const [ticket]=await sql<{id:number}[]>`INSERT INTO tickets(category,barangay_id,status,member_count,assigned_office,geom) VALUES('Pothole',${barangay.id},'Reported',1,'MEO',ST_SetSRID(ST_MakePoint(${lng},${lat}),4326)) RETURNING id`;
 await sql`INSERT INTO reports(ticket_id,citizen_id,title,description,citizen_severity,image_url,geom,pin_geom,exif_geom,exif_captured_at,flags) VALUES(${ticket.id},${citizen.id},'POTHOLE: main road pavement defect','Deep pavement defect caused by heavy sand hauling trucks near main road segment','High','mock://porac-exif-geotag.jpg',ST_SetSRID(ST_MakePoint(${lng},${lat}),4326),ST_SetSRID(ST_MakePoint(${lng},${lat}),4326),ST_SetSRID(ST_MakePoint(${lng},${lat}),4326),${exif.DateTimeOriginal},ARRAY[${`MOCK_EXIF:${JSON.stringify(exif)}`}])`;
 console.log(JSON.stringify({ticketId:ticket.id,barangay:barangay.name,exif})); await sql.end();
}
main().catch(async error=>{console.error(error);await sql.end();process.exit(1)});