const express = require('express')
const app = express()
const { MongoClient, ObjectId } = require('mongodb');
const methodOverride = require('method-override')
const bcrypt = require('bcrypt')

app.use(methodOverride('_method'))
app.use(express.static(__dirname + '/public'))
app.set('view engine', 'ejs')
app.use(express.json())
app.use(express.urlencoded({extended:true}))

const session = require('express-session')
const passport = require('passport')
const LocalStrategy = require('passport-local')
const MongoStore = require('connect-mongo')

require('dotenv').config();

app.use(passport.initialize())
app.use(session({
  secret: '암호화에 쓸 비번',
  resave : false,
  saveUninitialized : false,
  cookie : { maxAge : 60 * 60 * 1000 },
  store : MongoStore.create({
    mongoUrl : process.env.DBURL,
    dbName : 'forum'
  })
}))

app.use(passport.session()) 



let db;
const url = 'mongodb+srv://admin:jungle1004@jungle.4tdtb.mongodb.net/?retryWrites=true&w=majority&appName=Jungle';
new MongoClient(url).connect().then((client)=>{
    console.log('DB연결성공')
    db = client.db('forum');
}).catch((err)=>{
    console.log(err)
})


app.listen(8080, () => {
    console.log('http://localhost:8080에서 서버 실행 중')
})

app.get('/', (요청, 응답) => {
    응답.render('index');
}) 

app.get('/list', async (요청, 응답) => {
    let result = await db.collection('post').find().toArray()
    console.log(result[0].title)
    // 응답.send(result[0].title)
    응답.render('list.ejs', { 글목록 : result })
})

app.get('/time', async (요청, 응답) => {
    let time = new Date()
    console.log(time)
    응답.render('time.ejs', { 시간 : time })
})

//글 작성 기능 구현해보자
//1. 유저가 작성한 글을 DB에 저장해주기 - 화면에 글 작성하는 포맷이 필요, 작성 버튼 누르면 DB에 저장되어야 한다
//2. DB에 저장된 자료를 가져와서 화면에 출력해주기

//글 작성 페이지
app.get('/write', async (요청, 응답) => {
    응답.render('write.ejs')
})

//글 작성
app.post('/add', async (요청, 응답) => {
    console.log(요청.body)

    try {
        if (요청.body.title == '' || 요청.body.content == '') {
            응답.send('내용입력안했는데?')
        } else {
            await db.collection('post').insertOne({
               title : 요청.body.title,
               content : 요청.body.content
            })
        }
    } catch(e) {
        console.log(e)
        응답.status(500).send('서버에러남')
    }

    응답.redirect('/list')
})

//상세페이지 출력
app.get('/detail/:id', async (요청, 응답) => {
    //없는 id 입력 시 에러 발생, 에러 방지 위한 try-catch문
    try {
        //3. 유저가 입력한 파라미터 가져오기
        console.log('이게 바로 요청파람', 요청.params)
    
        //2. 상세페이지 {_id : 어쩌구} 글을 DB에서 찾아옴
        let result = await db.collection('post').findOne({ _id : new ObjectId(요청.params.id) })
        console.log(result);
    
        if (result == null) {
            응답.status(400).send('이상한 url 입력함')
        }

        //1. 출력
        응답.render('detail.ejs', { result : result })
    } catch(e) {
        console.log(e)
        응답.status(404).send('url 주소가 잘못됨')        
    }
})


//수정하기 페이지 출력(이전 저장 정보 유지)
app.get('/edit/:id', async (요청, 응답) => {
    let result = await db.collection('post').findOne({ _id : new ObjectId(요청.params.id) })
    console.log(result)
    응답.render('edit.ejs', {result : result})
})


//수정하기 전송누르면 DB 글 수정
app.put('/edit', async (요청, 응답) => {
    await db.collection('post').updateOne({ _id : new ObjectId(요청.body.id)}, {$set : { title : 요청.body.title, content : 요청.body.content }})
    console.log(요청.body)
    응답.redirect('/list/1')
})


//삭제하기
app.delete('/delete', async (요청, 응답) => {
    console.log(요청.query)
    await db.collection('post').deleteOne({ _id : new ObjectId(요청.query.docid)})
    응답.send('삭제완료')
})


//페이징
app.get('/list/:id', async (요청, 응답) => {
    //6번 ~ 10번 글을 찾아서 result 변수에 저장
    let result = await db.collection('post').find().skip( (요청.params.id - 1) * 5).limit(5).toArray()
    응답.render('list.ejs', { 글목록 : result })
})


//session 방식으로 가입, 로그인 기능 구현
//라이브러리 이용
passport.use(new LocalStrategy(async (입력한아이디, 입력한비번, cb) => {
    let result = await db.collection('user').findOne({ username : 입력한아이디 })
    if (!result) {
        return cb(null, false, { message : '아이디 DB에 없음' })
    }
    
    if (await bcrypt.compare(입력한비번, result.password)) {
        return cb(null, result)
    } else {
        return cb(null, false, { message : '비번불일치' })
    }
}))


//세션 만들기
passport.serializeUser((user, done) => {
    console.log(user)
    process.nextTick(() => {
      done(null, { id: user._id, username: user.username })
    })
  })

passport.deserializeUser(async (user, done) => {
    let result = await db.collection('user').findOne({ _id : new ObjectId(user.id) })
    delete result.password
    process.nextTick(() => {
        done(null, result)
    })
})

app.get('/login', async (요청, 응답) => {
    //console.log(요청.user)
    응답.render('login.ejs')
})

app.post('/login', async (요청, 응답, next) => {
    passport.authenticate('local', (error, user, info) => {
        if (error) return 응답.status(500).json(error)
        if (!user) return 응답.status(401).json(info.message)
        요청.logIn(user, (err) => {
            if (err) return next(err)

            // 로그인 성공 시 사용자 정보를 콘솔에 출력
            console.log('로그인된 사용자 정보:', user);
            
            응답.redirect('/')
        })
    })(요청, 응답, next)
})

//회원가입하기
app.get('/register', async (요청, 응답) => {
    응답.render('register.ejs')
})

app.post('/register', async (요청, 응답) => {
    //비밀번호 암호화 (해싱)
    let 해시 = await bcrypt.hash(요청.body.password, 10)
    
    await db.collection('user').insertOne({ username : 요청.body.username, password : 해시 })
    응답.redirect('/')
})

