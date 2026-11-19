#!/usr/bin/env python3
import argparse, json, os, random, subprocess, time
def make_payload(fail=False):
    if fail:
        return {"device_id":"nodealert-luz01","presencia":random.choice([0,1]),"rele_canal1":random.choice([0,1])}
    return {"device_id":"nodealert-luz01","presencia":random.choice([0,1]),"luz_ventana_lx":round(random.uniform(0,300),1),"luz_aula_lx":round(random.uniform(0,200),1),"temp_c":round(random.uniform(18,35),1),"humedad_pct":random.randint(30,80),"rele_canal1":random.choice([0,1])}
def publish(broker,port,user,pw,topic,payload):
    subprocess.run(["mosquitto_pub","-h",broker,"-p",str(port),"-u",user,"-P",pw,"-t",topic,"-m",json.dumps(payload),"-q","1"],check=True)
def main():
    ap=argparse.ArgumentParser(); ap.add_argument("--broker",default="localhost"); ap.add_argument("--port",type=int,default=1883); ap.add_argument("--interval",type=float,default=0.1); ap.add_argument("--count",type=int,default=0); ap.add_argument("--fail-rate",type=float,default=0.3); a=ap.parse_args()
    n=0
    while a.count==0 or n<a.count:
        fail=random.random()<a.fail_rate
        p=make_payload(fail)
        print(p)
        publish(a.broker,a.port,"nodealert_esp32",os.environ.get("MQTT_PASS","TU_PASSWORD_MQTT"),"nodealert/nodealert-luz01/telemetry",p)
        n+=1; time.sleep(a.interval)
if __name__=="__main__": main()
