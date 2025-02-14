/*
* Based on https://github.com/ccoenraets/react-trivia
* Published under MIT license
*/
import React from 'react';
import { createRoot } from "react-dom/client";
import Card from './Card';
import Headers from './Headers';
import Footer from './Footer';
import request from './request';

class App extends React.Component {

    constructor(props) {
        super(props);
        this.state = {
            windowWidth: window.innerWidth,
            windowHeight: window.innerHeight,
            data: []
        };
    }

    handleResize(event) {
        this.setState({
            windowWidth: window.innerWidth,
            windowHeight: window.innerHeight
        });
    }


    componentDidMount() {
        window.addEventListener('resize', this.handleResize.bind(this));
        let rows = 0;
        data.forEach(category => {
            if (category.questions.length > rows) {
                rows = category.questions.length;
            }
        });
        this.setState({data: data, rows: rows, cols: data.length});
    }

    componentDidMount() {
        window.addEventListener('resize', this.handleResize.bind(this));
        request({url: __TRIVIA_API__ + '/api/trivia/all'}).then(result => {
            let data = JSON.parse(result),
                rows = 0;
            data.forEach(category => {
                if (category.questions.length > rows) {
                    rows = category.questions.length;
                }
            });
            this.setState({data: data, rows: rows, cols: data.length});
        });
    }

    componentWillUnmount() {
        window.removeEventListener('resize', this.handleResize);
    }

    render() {
        let footerHeight = this.state.windowWidth > 640 ? 60 : 32,
            footerTop = this.state.windowHeight - footerHeight,
            headerHeight = this.state.windowWidth > 640 ? 60 : 32,
            cardWidth = this.state.windowWidth / this.state.cols,
            cardHeight = (this.state.windowHeight - headerHeight - footerHeight) / this.state.rows,
            cards = [];

        this.state.data.forEach((category, categoryIndex) => {
            let left = categoryIndex * cardWidth;
            category.questions.forEach((question, questionIndex) => {
                cards.push(<Card left={left} top={questionIndex * cardHeight + headerHeight} height={cardHeight} width={cardWidth} question={question} key={categoryIndex + '-' + questionIndex}/>);
            })
        });
        return (
            <div>
                <Headers data={this.state.data} headerWidth={cardWidth}/>
                {cards}
                <Footer top={footerTop} width={this.state.windowWidth} height={footerHeight} />
            </div>
        );
    }

};

const root = createRoot(document.getElementById('app'));
root.render(<App/>);
