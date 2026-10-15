"""Rebuild answer-length clips from original meme-source downloads.
Usage: python scripts/refine-cat-audio.py /path/to/meme-research
Never reads or modifies wedding production data.
"""
import json, pathlib, subprocess, sys
root=pathlib.Path(__file__).resolve().parents[1]
raw=pathlib.Path(sys.argv[1])
assets=root/'public/cat-meme-assets'
# Musical boundaries use repeating motifs; calls use silence on both sides.
specs={
 'huh':('huh-raw.mp3',1.0,2.2,'完整第一聲，前後保留停頓'),
 'happy':('happy-raw.mp3',0,2.50,'Happy 短樂句'),
 'banana':('banana-raw.mp3',0,3.22,'第一段哭聲，停頓處結束'),
 'chipi':('chipi-raw.mp3',0,6.50,'一輪完整副歌節奏，不接第二輪'),
 'oiia':('oiia-raw.mp3',.20,2.23,'第一段旋轉叫聲，保留尾端停頓'),
 'no-no':('no-no-raw.mp3',0,4.22,'第一段拒絕叫聲，停頓處結束'),
 'nyan':('nyan-raw.mp3',0,6.76,'一輪重複主旋律'),
 'vibing':('vibing-raw.mp3',0,8.28,'兩段四拍樂句，低音量處收尾'),
 'maxwell':('maxwell-raw.mp3',0,7.24,'一輪主旋律'),
 'german':('german-cat-raw.mp3',0,5.094,'保留來源整段短配音，避免句中截斷'),
 'aggrieved':('aggrieved-full.mp3',2.65,3.95,'單聲委屈叫聲，保留前後停頓'),
}
manifest=[]
for key,(filename,start,end,description) in specs.items():
 duration=end-start
 filters=f'atrim=start={start}:end={end},asetpts=PTS-STARTPTS,loudnorm=I=-18:TP=-2:LRA=11'
 # Brief edge fades prevent clicks; no long fade over the final syllable.
 if key not in ('huh','banana','oiia','no-no','aggrieved'):
  filters+=f',afade=t=in:d=0.008,afade=t=out:st={duration-.025}:d=0.025'
 filters+=',apad=pad_dur=0.16'
 subprocess.run(['ffmpeg','-y','-v','error','-i',str(raw/filename),'-af',filters,'-ar','44100','-ac','1','-b:a','96k',str(assets/(key+'.mp3'))],check=True)
 manifest.append(dict(id=key,sourceStart=start,sourceEnd=end,tailPause=.16,description=description))
# Popcat's sound is naturally very brief: three intact pops separated by pauses.
subprocess.run(['ffmpeg','-y','-v','error','-i',str(raw/'pop-raw.mp3'),'-af','loudnorm=I=-18:TP=-2:LRA=11,aresample=44100,apad=whole_dur=0.38,aloop=loop=2:size=16758,apad=pad_dur=0.16','-ar','44100','-ac','1','-b:a','96k',str(assets/'pop.mp3')],check=True)
manifest.append(dict(id='pop',description='完整啵聲三次，中間保留停頓'))
(assets/'audio-edits.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
